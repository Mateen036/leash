//! Per-account guard (compile with `--features mainnet` for NEAR mainnet). Amounts are integer base units; perp_usd is whole USD.
//! Caps reserve attempted spend before asynchronous calls and are not refunded on failure.
//! Panics roll back state: rejected attempts live in transaction receipts, not the activity ring.
use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, json, Value};
use near_sdk::{
    env, near, require, AccountId, Gas, GasWeight, NearToken, PanicOnDefault, Promise,
    PromiseOrValue, PublicKey,
};
use std::collections::BTreeMap;

const DAY_MS: u64 = 86_400_000;
const NEAR: u128 = 10u128.pow(24);
const RESERVE: u128 = 3 * NEAR / 10;
#[cfg(not(feature = "mainnet"))]
const WRAP: &str = "wrap.testnet";
#[cfg(feature = "mainnet")]
const WRAP: &str = "wrap.near";
#[cfg(not(feature = "mainnet"))]
const REF: &str = "ref-finance-101.testnet";
#[cfg(feature = "mainnet")]
const REF: &str = "v2.ref-finance.near";
#[cfg(not(feature = "mainnet"))]
const BURROW: &str = "contract.burrow.testnet";
#[cfg(feature = "mainnet")]
const BURROW: &str = "contract.main.burrow.near";
#[cfg(not(feature = "mainnet"))]
const LINEAR: &str = "linear-protocol.testnet";
#[cfg(feature = "mainnet")]
const LINEAR: &str = "linear-protocol.near";

#[cfg(not(feature = "mainnet"))]
const ORDERLY_VENUE: &str = "orderly-testnet";
#[cfg(feature = "mainnet")]
const ORDERLY_VENUE: &str = "orderly-mainnet";

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Cap {
    pub per_action: U128,
    pub daily: U128,
}
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Policy {
    pub allowed_protocols: Vec<AccountId>,
    pub caps: BTreeMap<String, Cap>,
    pub max_slippage_bps: u16,
    pub max_leverage_x100: u32,
    pub max_perp_notional_usd: u64,
    pub expires_at_ms: u64,
    pub paused: bool,
}
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, Default)]
pub struct Spent {
    pub day_index: u64,
    pub amount: U128,
}
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Activity {
    pub id: u64,
    pub ts: u64,
    pub kind: String,
    pub protocol: String,
    pub asset: String,
    pub amount: U128,
    pub ok: bool,
    pub reason: String,
    pub detail: String,
}
#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
#[serde(tag = "kind")]
pub enum Action {
    RefSwap {
        pool_id: u64,
        token_in: AccountId,
        token_out: AccountId,
        amount_in: U128,
        min_amount_out: U128,
    },
    BurrowSupply {
        token: AccountId,
        amount: U128,
        as_collateral: bool,
    },
    BurrowWithdraw {
        token: AccountId,
        amount: U128,
    },
    LinearStake {
        amount: U128,
    },
    LinearUnstake {
        amount: U128,
    },
}
#[near(serializers = [borsh])]
#[derive(Clone)]
enum Check {
    None,
    WrapBalance,
    OutputBefore,
    TransferUsed,
    OutputAfter(u8),
    BurrowAccount,
}
#[near(serializers = [borsh])]
#[derive(Clone)]
struct Step {
    receiver: AccountId,
    method: String,
    args: String,
    gas: u64,
    deposit: u128,
    check: Check,
}
#[near(serializers = [borsh])]
#[derive(Clone)]
struct Pending {
    id: u64,
    action: Action,
    steps: Vec<Step>,
    before: u128,
    key: PublicKey,
}
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Guard {
    agent_pk: Option<PublicKey>,
    policy: Policy,
    spent: BTreeMap<String, Spent>,
    activity: Vec<Activity>,
    next_id: u64,
    pending: Option<Pending>,
}
fn step(receiver: &str, method: &str, args: Value, gas: u64, deposit: u128, check: Check) -> Step {
    Step {
        receiver: receiver.parse().unwrap(),
        method: method.into(),
        args: args.to_string(),
        gas,
        deposit,
        check,
    }
}
fn storage(receiver: &str, deposit: u128, registration_only: bool) -> Step {
    require!(deposit <= NEAR / 10, "STORAGE_CAP");
    step(
        receiver,
        "storage_deposit",
        json!({"account_id":env::current_account_id(),"registration_only":registration_only}),
        10,
        deposit,
        Check::None,
    )
}
fn balance(token: &str, check: Check) -> Step {
    step(
        token,
        "ft_balance_of",
        json!({"account_id":env::current_account_id()}),
        5,
        0,
        check,
    )
}
fn result() -> Option<Vec<u8>> {
    env::promise_result_checked(0, 32_768).ok()
}
fn parsed<T: near_sdk::serde::de::DeserializeOwned>(bytes: &[u8]) -> Option<T> {
    serde_json::from_slice(bytes).ok()
}

#[near]
impl Guard {
    #[init]
    pub fn init(agent_pk: PublicKey, policy: Policy) -> Self {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "OWNER_ONLY"
        );
        Self::validate(&policy);
        Self {
            agent_pk: Some(agent_pk),
            policy,
            spent: BTreeMap::new(),
            activity: vec![],
            next_id: 1,
            pending: None,
        }
    }
    pub fn set_policy(&mut self, policy: Policy) {
        self.owner();
        Self::validate(&policy);
        self.policy = policy;
    }
    pub fn pause(&mut self) {
        self.owner();
        self.policy.paused = true;
        self.cancel_pending();
    }
    pub fn unpause(&mut self) {
        self.owner();
        self.policy.paused = false;
    }
    pub fn revoke_agent(&mut self) -> Promise {
        self.owner();
        let key = self
            .agent_pk
            .take()
            .unwrap_or_else(|| env::panic_str("NOT_AGENT"));
        self.policy.paused = true;
        self.cancel_pending();
        self.record(
            "revoke_agent",
            "self",
            "near",
            0,
            true,
            "REVOKED",
            "Agent key deleted".into(),
        );
        Promise::new(env::current_account_id()).delete_key(key)
    }
    pub fn get_policy(&self) -> Policy {
        self.policy.clone()
    }
    /// Normalize stale UTC windows on read as well as on the next debit.
    pub fn get_spent(&self) -> BTreeMap<String, Spent> {
        let day = env::block_timestamp_ms() / DAY_MS;
        self.spent
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    if v.day_index == day {
                        v.clone()
                    } else {
                        Spent {
                            day_index: day,
                            amount: U128(0),
                        }
                    },
                )
            })
            .collect()
    }
    pub fn get_activity(&self) -> Vec<Activity> {
        self.activity.clone()
    }
    pub fn get_agent_key(&self) -> Option<PublicKey> {
        self.agent_pk.clone()
    }
    pub fn version(&self) -> String {
        "leash-guard/1.0.0".into()
    }

    pub fn agent_execute(&mut self, action: Action) -> Promise {
        self.agent();
        require!(self.pending.is_none(), "BUSY");
        let (kind, protocol, asset, amount) = action.meta();
        self.protocol(protocol);
        require!(amount > 0, "ZERO_AMOUNT");
        if let Action::RefSwap {
            min_amount_out,
            token_in,
            token_out,
            ..
        } = &action
        {
            // A price oracle is not embedded: the server derives this positive floor from a fresh
            // quote and policy.max_slippage_bps; Ref enforces the supplied minimum on chain.
            require!(min_amount_out.0 > 0 && token_in != token_out, "SLIPPAGE");
            require!(
                self.policy.caps.contains_key(token_out.as_str()),
                "ASSET_NOT_ALLOWED"
            );
        }
        self.charge(&asset, amount);
        if matches!(action, Action::LinearStake { .. }) {
            self.liquid(amount);
        }
        // Reserve storage costs too; keep 0.3 NEAR for gas and future owner transactions.
        let steps = self.plan(&action);
        self.liquid(steps.iter().map(|s| s.deposit).sum::<u128>());
        let id = self.record(
            kind,
            protocol,
            &asset,
            amount,
            false,
            "PENDING",
            serde_json::to_string(&action).unwrap(),
        );
        self.pending = Some(Pending {
            id,
            action,
            steps,
            before: 0,
            key: self.agent_pk.clone().unwrap(),
        });
        self.schedule()
    }
    pub fn authorize_perp(
        &mut self,
        venue: String,
        symbol: String,
        side: String,
        notional_usd: u64,
        leverage_x100: u32,
    ) -> u64 {
        self.agent();
        self.protocol(&venue);
        require!(venue == ORDERLY_VENUE, "PROTOCOL_NOT_ALLOWED");
        require!(
            symbol.len() <= 64
                && !symbol.is_empty()
                && (side == "BUY" || side == "SELL" || side == "buy" || side == "sell"),
            "INVALID_PERP"
        );
        require!(
            leverage_x100 > 0 && leverage_x100 <= self.policy.max_leverage_x100,
            "LEVERAGE"
        );
        require!(
            notional_usd > 0 && notional_usd <= self.policy.max_perp_notional_usd,
            "NOTIONAL"
        );
        self.charge("perp_usd", u128::from(notional_usd));
        self.record(
            "authorize_perp",
            &venue,
            "perp_usd",
            notional_usd.into(),
            true,
            "AUTHORIZED",
            json!({"symbol":symbol,"side":side,"leverage_x100":leverage_x100}).to_string(),
        )
    }
    /// Only receipts created by this contract can advance the serialized operation.
    #[private]
    pub fn on_step(&mut self, id: u64) -> PromiseOrValue<u64> {
        let Some(mut p) = self.pending.take() else {
            return PromiseOrValue::Value(id);
        };
        require!(p.id == id, "WRONG_OPERATION");
        let completed = p.steps.remove(0);
        let Some(bytes) = result() else {
            self.finish(id, false, "PROTOCOL_FAILED");
            return PromiseOrValue::Value(id);
        };
        let mut error = None;
        match completed.check {
            Check::None => {}
            Check::WrapBalance => {
                if let Some(held) = parsed::<U128>(&bytes) {
                    let amount = p.action.amount();
                    let needed = amount.saturating_sub(held.0);
                    if needed > 0 {
                        if self.has_liquid(needed + p.steps.iter().map(|s| s.deposit).sum::<u128>())
                        {
                            p.steps.insert(
                                0,
                                step(WRAP, "near_deposit", json!({}), 10, needed, Check::None),
                            );
                        } else {
                            env::log_str(&json!({"event":"low_balance","balance":env::account_balance().as_yoctonear().to_string(),"storage_bytes":env::storage_usage(),"byte_cost":env::storage_byte_cost().as_yoctonear().to_string(),"required":(needed + p.steps.iter().map(|s|s.deposit).sum::<u128>()).to_string()}).to_string());
                            error = Some("LOW_BALANCE");
                        }
                    }
                } else {
                    error = Some("BALANCE_UNKNOWN");
                }
            }
            Check::OutputBefore => {
                if let Some(v) = parsed::<U128>(&bytes) {
                    p.before = v.0;
                } else {
                    error = Some("BALANCE_UNKNOWN");
                }
            }
            Check::TransferUsed => {
                if parsed::<U128>(&bytes).map(|v| v.0) != Some(p.action.amount()) {
                    error = Some("INPUT_REFUNDED");
                }
            }
            Check::OutputAfter(retries) => {
                if let Action::RefSwap {
                    token_out,
                    min_amount_out,
                    ..
                } = &p.action
                {
                    let received = parsed::<U128>(&bytes)
                        .map(|v| v.0.saturating_sub(p.before))
                        .unwrap_or(0);
                    if received < min_amount_out.0 {
                        if retries > 0 {
                            p.steps.insert(
                                0,
                                balance(token_out.as_str(), Check::OutputAfter(retries - 1)),
                            );
                        } else {
                            error = Some("OUTPUT_NOT_DELIVERED");
                        }
                    }
                }
            }
            Check::BurrowAccount => {
                if let (Some(account), Action::BurrowWithdraw { token, amount }) =
                    (parsed::<Value>(&bytes), &p.action)
                {
                    let supplied = asset_balance(&account, "supplied", token);
                    let needed = amount.0.saturating_sub(supplied);
                    let mut actions = vec![];
                    if needed > 0 {
                        actions.push(json!({"DecreaseCollateral":{"token_id":token,"max_amount":U128(needed)}}));
                    }
                    actions.push(json!({"Withdraw":{"token_id":token,"max_amount":amount}}));
                    p.steps.insert(
                        0,
                        step(
                            BURROW,
                            "execute",
                            json!({"actions":actions}),
                            80,
                            1,
                            Check::None,
                        ),
                    );
                } else {
                    error = Some("BALANCE_UNKNOWN");
                }
            }
        }
        if let Some(reason) = error {
            self.finish(id, false, reason);
            return PromiseOrValue::Value(id);
        }
        if p.steps.is_empty() {
            self.finish(id, true, "COMPLETED");
            return PromiseOrValue::Value(id);
        }
        // Stop unissued steps after an owner pause/revoke or expiry. Already-issued receipts
        // cannot be cancelled by NEAR; any delivered tokens/positions belong to this account.
        if self.policy.paused
            || env::block_timestamp_ms() >= self.policy.expires_at_ms
            || self.agent_pk.as_ref() != Some(&p.key)
        {
            self.finish(id, false, "CANCELLED");
            return PromiseOrValue::Value(id);
        }
        self.pending = Some(p);
        PromiseOrValue::Promise(self.schedule())
    }
}
fn asset_balance(account: &Value, field: &str, token: &AccountId) -> u128 {
    account[field]
        .as_array()
        .and_then(|items| {
            items
                .iter()
                .find(|v| v["token_id"].as_str() == Some(token.as_str()))
        })
        .and_then(|v| v["balance"].as_str())
        .and_then(|v| v.parse().ok())
        .unwrap_or(0)
}
impl Action {
    fn amount(&self) -> u128 {
        match self {
            Self::RefSwap { amount_in, .. } => amount_in.0,
            Self::BurrowSupply { amount, .. }
            | Self::BurrowWithdraw { amount, .. }
            | Self::LinearStake { amount }
            | Self::LinearUnstake { amount } => amount.0,
        }
    }
    fn meta(&self) -> (&'static str, &'static str, String, u128) {
        let (kind, protocol, asset) = match self {
            Self::RefSwap { token_in, .. } => (
                "RefSwap",
                REF,
                if token_in.as_str() == WRAP {
                    "near".into()
                } else {
                    token_in.to_string()
                },
            ),
            Self::BurrowSupply { token, .. } => (
                "BurrowSupply",
                BURROW,
                if token.as_str() == WRAP {
                    "near".into()
                } else {
                    token.to_string()
                },
            ),
            Self::BurrowWithdraw { token, .. } => ("BurrowWithdraw", BURROW, token.to_string()),
            Self::LinearStake { .. } => ("LinearStake", LINEAR, "near".into()),
            Self::LinearUnstake { .. } => ("LinearUnstake", LINEAR, LINEAR.into()),
        };
        (kind, protocol, asset, self.amount())
    }
}
impl Guard {
    fn validate(p: &Policy) {
        require!(
            p.allowed_protocols.len() <= 20 && p.caps.len() <= 32 && p.max_slippage_bps <= 10_000,
            "INVALID_POLICY"
        );
        for (asset, cap) in &p.caps {
            require!(
                asset == "near" || asset == "perp_usd" || asset.parse::<AccountId>().is_ok(),
                "INVALID_ASSET"
            );
            require!(
                cap.per_action.0 > 0 && cap.per_action.0 <= cap.daily.0,
                "INVALID_CAP"
            );
        }
    }
    fn owner(&self) {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "OWNER_ONLY"
        );
        require!(
            self.agent_pk.as_ref() != Some(&env::signer_account_pk()),
            "OWNER_ONLY"
        );
    }
    fn agent(&self) {
        require!(
            env::predecessor_account_id() == env::current_account_id()
                && env::signer_account_id() == env::current_account_id()
                && self.agent_pk.as_ref() == Some(&env::signer_account_pk()),
            "NOT_AGENT"
        );
        require!(!self.policy.paused, "PAUSED");
        require!(
            env::block_timestamp_ms() < self.policy.expires_at_ms,
            "EXPIRED"
        );
    }
    fn protocol(&self, protocol: &str) {
        require!(
            self.policy
                .allowed_protocols
                .iter()
                .any(|v| v.as_str() == protocol),
            "PROTOCOL_NOT_ALLOWED"
        );
    }
    fn charge(&mut self, asset: &str, amount: u128) {
        let cap = self
            .policy
            .caps
            .get(asset)
            .unwrap_or_else(|| env::panic_str("CAP_PER_ACTION"));
        require!(amount <= cap.per_action.0, "CAP_PER_ACTION");
        let day = env::block_timestamp_ms() / DAY_MS;
        // Bounded map, even if the owner rotates the capped asset set.
        self.spent
            .retain(|k, v| self.policy.caps.contains_key(k) || v.day_index == day);
        require!(
            self.spent.contains_key(asset) || self.spent.len() < 64,
            "INVALID_POLICY"
        );
        let spent = self.spent.entry(asset.into()).or_default();
        if spent.day_index != day {
            spent.day_index = day;
            spent.amount = U128(0);
        }
        require!(
            amount <= cap.daily.0.saturating_sub(spent.amount.0),
            "CAP_DAILY"
        );
        spent.amount = U128(spent.amount.0 + amount);
    }
    fn cancel_pending(&mut self) {
        if let Some(p) = self.pending.take() {
            self.finish(p.id, false, "CANCELLED");
        }
    }
    fn liquid(&self, amount: u128) {
        require!(self.has_liquid(amount), "LOW_BALANCE");
    }
    fn has_liquid(&self, amount: u128) -> bool {
        let locked = u128::from(env::storage_usage()) * env::storage_byte_cost().as_yoctonear();
        env::account_balance().as_yoctonear().saturating_sub(locked)
            >= amount.saturating_add(RESERVE)
    }
    fn record(
        &mut self,
        kind: &str,
        protocol: &str,
        asset: &str,
        amount: u128,
        ok: bool,
        reason: &str,
        detail: String,
    ) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        if self.activity.len() == 50 {
            self.activity.remove(0);
        }
        let a = Activity {
            id,
            ts: env::block_timestamp_ms(),
            kind: kind.into(),
            protocol: protocol.into(),
            asset: asset.into(),
            amount: U128(amount),
            ok,
            reason: reason.into(),
            detail,
        };
        env::log_str(
            &json!({"standard":"leash","version":"1.0.0","event":"activity","data":[&a]})
                .to_string(),
        );
        self.activity.push(a);
        id
    }
    fn finish(&mut self, id: u64, ok: bool, reason: &str) {
        if let Some(a) = self.activity.iter_mut().find(|v| v.id == id) {
            a.ok = ok;
            a.reason = reason.into();
        }
        env::log_str(&json!({"standard":"leash","version":"1.0.0","event":"resolved","data":[{"id":id,"ok":ok,"reason":reason}]}).to_string());
    }
    fn schedule(&self) -> Promise {
        let p = self.pending.as_ref().unwrap();
        let s = &p.steps[0];
        Promise::new(s.receiver.clone())
            .function_call(
                &s.method,
                s.args.as_bytes().to_vec(),
                NearToken::from_yoctonear(s.deposit),
                Gas::from_tgas(s.gas),
            )
            .then(
                Promise::new(env::current_account_id()).function_call_weight(
                    "on_step",
                    json!({"id":p.id}).to_string().into_bytes(),
                    NearToken::from_yoctonear(0),
                    Gas::from_tgas(5),
                    GasWeight(1),
                ),
            )
    }
    fn plan(&self, action: &Action) -> Vec<Step> {
        match action {
            Action::LinearStake { amount } => vec![step(
                LINEAR,
                "deposit_and_stake",
                json!({}),
                40,
                amount.0,
                Check::None,
            )],
            Action::LinearUnstake { amount } => vec![step(
                LINEAR,
                "unstake",
                json!({"amount":amount}),
                40,
                0,
                Check::None,
            )],
            Action::BurrowWithdraw { .. } => vec![step(
                BURROW,
                "get_account",
                json!({"account_id":env::current_account_id()}),
                10,
                0,
                Check::BurrowAccount,
            )],
            Action::BurrowSupply {
                token,
                amount,
                as_collateral,
            } => {
                let mut s = vec![];
                if token.as_str() == WRAP {
                    s.push(storage(WRAP, NEAR / 100, true));
                    s.push(balance(WRAP, Check::WrapBalance));
                }
                s.push(storage(BURROW, NEAR / 10, true));
                let msg = if *as_collateral {
                    json!({"Execute":{"actions":[{"IncreaseCollateral":{"token_id":token,"max_amount":amount}}]}}).to_string()
                } else {
                    String::new()
                };
                s.push(step(
                    token.as_str(),
                    "ft_transfer_call",
                    json!({"receiver_id":BURROW,"amount":amount,"msg":msg}),
                    100,
                    1,
                    Check::TransferUsed,
                ));
                s
            }
            Action::RefSwap {
                pool_id,
                token_in,
                token_out,
                amount_in,
                min_amount_out,
            } => {
                let mut s = vec![];
                if token_in.as_str() == WRAP {
                    s.push(storage(WRAP, NEAR / 100, true));
                    s.push(balance(WRAP, Check::WrapBalance));
                }
                s.push(storage(REF, NEAR / 50, false));
                s.push(step(
                    REF,
                    "register_tokens",
                    json!({"token_ids":[token_in,token_out]}),
                    10,
                    1,
                    Check::None,
                ));
                s.push(storage(token_out.as_str(), NEAR / 100, true));
                s.push(balance(token_out.as_str(), Check::OutputBefore));
                let msg=json!({"force":0,"skip_unwrap_near":true,"actions":[{"pool_id":pool_id,"token_in":token_in,"token_out":token_out,"amount_in":amount_in,"min_amount_out":min_amount_out}]}).to_string();
                s.push(step(
                    token_in.as_str(),
                    "ft_transfer_call",
                    json!({"receiver_id":REF,"amount":amount_in,"msg":msg}),
                    120,
                    1,
                    Check::TransferUsed,
                ));
                s.push(balance(token_out.as_str(), Check::OutputAfter(2)));
                s
            }
        }
    }
}
#[cfg(test)]
mod tests;
