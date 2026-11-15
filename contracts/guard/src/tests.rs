use super::*;
use near_sdk::{
    test_utils::{get_created_receipts, VMContextBuilder},
    testing_env, CurveType, PromiseResult,
};
fn pk(n: u8) -> PublicKey {
    PublicKey::from_parts(CurveType::ED25519, vec![n; 32]).unwrap()
}
fn context(key: u8, day: u64) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id("guest.testnet".parse().unwrap())
        .predecessor_account_id("guest.testnet".parse().unwrap())
        .signer_account_id("guest.testnet".parse().unwrap())
        .signer_account_pk(pk(key))
        .block_timestamp((day * DAY_MS + 1) * 1_000_000)
        .account_balance(NearToken::from_near(10))
        .prepaid_gas(Gas::from_tgas(300));
    b
}
fn policy() -> Policy {
    Policy {
        allowed_protocols: vec![
            REF.parse().unwrap(),
            BURROW.parse().unwrap(),
            LINEAR.parse().unwrap(),
            ORDERLY_VENUE.parse().unwrap(),
        ],
        caps: [
            ("near", NEAR / 2, NEAR),
            (WRAP, NEAR / 2, NEAR),
            (LINEAR, NEAR / 2, NEAR),
            ("usdc.fakes.testnet", 50_000_000, 150_000_000),
            ("perp_usd", 500, 1500),
        ]
        .into_iter()
        .map(|(k, a, d)| {
            (
                k.into(),
                Cap {
                    per_action: U128(a),
                    daily: U128(d),
                },
            )
        })
        .collect(),
        max_slippage_bps: 100,
        max_leverage_x100: 500,
        max_perp_notional_usd: 500,
        expires_at_ms: 100 * DAY_MS,
        paused: false,
    }
}
fn guard() -> Guard {
    testing_env!(context(2, 1).build());
    Guard::init(pk(1), policy())
}
fn agent() {
    testing_env!(context(1, 1).build());
}
fn stake(n: u128) -> Action {
    Action::LinearStake { amount: U128(n) }
}
fn perp(g: &mut Guard, n: u64, l: u32) -> u64 {
    g.authorize_perp(
        ORDERLY_VENUE.into(),
        "PERP_ETH_USDC".into(),
        "BUY".into(),
        n,
        l,
    )
}
fn callback(bytes: &[u8], day: u64) {
    testing_env!(
        context(1, day).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![PromiseResult::Successful(bytes.to_vec())]
    );
}
#[test]
fn stake_completes_only_after_callback() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(stake(NEAR / 5)));
    assert!(!g.activity[0].ok);
    assert_eq!(g.activity[0].reason, "PENDING");
    callback(b"null", 1);
    drop(g.on_step(1));
    assert!(g.activity[0].ok);
    assert!(g.pending.is_none());
    assert_eq!(g.get_spent()["near"].amount.0, NEAR / 5);
}
#[test]
#[should_panic(expected = "CAP_PER_ACTION")]
fn per_action() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(stake(NEAR)));
}
#[test]
#[should_panic(expected = "CAP_DAILY")]
fn daily() {
    let mut g = guard();
    agent();
    g.charge("near", NEAR / 2);
    g.charge("near", NEAR / 2);
    g.charge("near", 1);
}
#[test]
fn rollover_and_policy_changes_keep_spend() {
    let mut g = guard();
    agent();
    g.charge("near", NEAR / 2);
    testing_env!(context(2, 1).build());
    g.set_policy(policy());
    assert_eq!(g.get_spent()["near"].amount.0, NEAR / 2);
    testing_env!(context(1, 2).build());
    assert_eq!(g.get_spent()["near"].amount.0, 0);
    g.charge("near", 1);
    assert_eq!(g.get_spent()["near"].amount.0, 1);
    assert_eq!(g.get_spent()["near"].day_index, 2);
}
#[test]
#[should_panic(expected = "PROTOCOL_NOT_ALLOWED")]
fn protocol() {
    let mut g = guard();
    g.policy.allowed_protocols.clear();
    agent();
    drop(g.agent_execute(stake(1)));
}
#[test]
#[should_panic(expected = "EXPIRED")]
fn expired() {
    let mut g = guard();
    g.policy.expires_at_ms = DAY_MS + 1;
    agent();
    drop(g.agent_execute(stake(1)));
}
#[test]
#[should_panic(expected = "PAUSED")]
fn paused() {
    let mut g = guard();
    g.pause();
    agent();
    drop(g.agent_execute(stake(1)));
}
#[test]
fn unpause() {
    let mut g = guard();
    g.pause();
    g.unpause();
    assert!(!g.get_policy().paused);
}
#[test]
#[should_panic(expected = "NOT_AGENT")]
fn revoked() {
    let mut g = guard();
    drop(g.revoke_agent());
    assert!(g.get_agent_key().is_none());
    assert!(g.policy.paused);
    assert!(!get_created_receipts().is_empty());
    agent();
    drop(g.agent_execute(stake(1)));
}
#[test]
#[should_panic(expected = "NOT_AGENT")]
fn wrong_key() {
    let mut g = guard();
    drop(g.agent_execute(stake(1)));
}
#[test]
#[should_panic(expected = "NOT_AGENT")]
fn external_predecessor() {
    let mut g = guard();
    let mut b = context(1, 1);
    b.predecessor_account_id("evil.testnet".parse().unwrap());
    testing_env!(b.build());
    drop(g.agent_execute(stake(1)));
}
#[test]
#[should_panic(expected = "NOT_AGENT")]
fn external_signer() {
    let mut g = guard();
    let mut b = context(1, 1);
    b.signer_account_id("evil.testnet".parse().unwrap());
    testing_env!(b.build());
    drop(g.agent_execute(stake(1)));
}
#[test]
#[should_panic(expected = "OWNER_ONLY")]
fn agent_cannot_change_policy() {
    let mut g = guard();
    agent();
    g.set_policy(policy());
}
#[test]
#[should_panic(expected = "OWNER_ONLY")]
fn owner_external() {
    let mut g = guard();
    let mut b = context(2, 1);
    b.predecessor_account_id("evil.testnet".parse().unwrap());
    testing_env!(b.build());
    g.pause();
}
#[test]
#[should_panic(expected = "LEVERAGE")]
fn leverage() {
    let mut g = guard();
    agent();
    perp(&mut g, 50, 2000);
}
#[test]
#[should_panic(expected = "NOTIONAL")]
fn notional() {
    let mut g = guard();
    agent();
    perp(&mut g, 501, 300);
}
#[test]
#[should_panic(expected = "CAP_DAILY")]
fn perp_daily() {
    let mut g = guard();
    agent();
    for _ in 0..4 {
        perp(&mut g, 500, 300);
    }
}
#[test]
fn perp_and_bounded_activity() {
    let mut g = guard();
    agent();
    for _ in 0..60 {
        agent();
        perp(&mut g, 1, 300);
    }
    let a = g.get_activity();
    assert_eq!(a.len(), 50);
    assert_eq!(a[0].id, 11);
    assert_eq!(a[49].id, 60);
    assert_eq!(g.get_spent()["perp_usd"].amount.0, 60);
}
#[test]
#[should_panic(expected = "LOW_BALANCE")]
fn reserve() {
    let mut g = guard();
    let mut b = context(1, 1);
    b.account_balance(NearToken::from_millinear(499));
    testing_env!(b.build());
    drop(g.agent_execute(stake(NEAR / 5)));
}
#[test]
#[should_panic(expected = "SLIPPAGE")]
fn zero_min() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(Action::RefSwap {
        pool_id: 1,
        token_in: WRAP.parse().unwrap(),
        token_out: "usdc.fakes.testnet".parse().unwrap(),
        amount_in: U128(1),
        min_amount_out: U128(0),
    }));
}
#[test]
#[should_panic(expected = "BUSY")]
fn serializes() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(stake(1)));
    drop(g.agent_execute(stake(1)));
}
#[test]
fn protocol_failure_never_success() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(stake(1)));
    testing_env!(
        context(1, 1).build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![PromiseResult::Failed]
    );
    drop(g.on_step(1));
    assert!(!g.activity[0].ok);
    assert_eq!(g.activity[0].reason, "PROTOCOL_FAILED");
    assert!(g.pending.is_none());
    assert_eq!(g.get_spent()["near"].amount.0, 1);
}
#[test]
fn wrap_only_shortfall_and_storage_capped() {
    let g = guard();
    let a = Action::BurrowSupply {
        token: WRAP.parse().unwrap(),
        amount: U128(NEAR / 5),
        as_collateral: true,
    };
    let plan = g.plan(&a);
    assert!(matches!(plan[1].check, Check::WrapBalance));
    assert!(plan.iter().all(|s| s.deposit <= NEAR / 10));
    assert!(plan.last().unwrap().args.contains("IncreaseCollateral"));
    let mut g = g;
    agent();
    drop(g.agent_execute(a));
    callback(b"null", 1);
    drop(g.on_step(1));
    callback(format!("\"{}\"", NEAR / 10).as_bytes(), 1);
    drop(g.on_step(1));
    assert_eq!(g.pending.as_ref().unwrap().steps[0].method, "near_deposit");
    assert_eq!(g.pending.as_ref().unwrap().steps[0].deposit, NEAR / 10);
}
#[test]
fn withdraw_decreases_only_missing_collateral() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(Action::BurrowWithdraw {
        token: WRAP.parse().unwrap(),
        amount: U128(100),
    }));
    callback(json!({"supplied":[{"token_id":WRAP,"balance":"30"}],"collateral":[{"token_id":WRAP,"balance":"80"}]}).to_string().as_bytes(),1);
    drop(g.on_step(1));
    let s = &g.pending.as_ref().unwrap().steps[0];
    assert_eq!(s.deposit, 1);
    let v: Value = serde_json::from_str(&s.args).unwrap();
    assert_eq!(v["actions"][0]["DecreaseCollateral"]["max_amount"], "70");
    assert_eq!(v["actions"][1]["Withdraw"]["max_amount"], "100");
}
#[test]
fn swap_message_and_output() {
    let mut g = guard();
    agent();
    let a = Action::RefSwap {
        pool_id: 2973,
        token_in: WRAP.parse().unwrap(),
        token_out: "usdc.fakes.testnet".parse().unwrap(),
        amount_in: U128(10),
        min_amount_out: U128(1),
    };
    let plan = g.plan(&a);
    let transfer = plan
        .iter()
        .find(|s| s.method == "ft_transfer_call")
        .unwrap();
    let args: Value = serde_json::from_str(&transfer.args).unwrap();
    let msg: Value = serde_json::from_str(args["msg"].as_str().unwrap()).unwrap();
    assert_eq!(msg["force"], 0);
    assert_eq!(msg["skip_unwrap_near"], true);
    assert_eq!(msg["actions"][0]["min_amount_out"], "1");
    drop(g.agent_execute(a));
    g.pending.as_mut().unwrap().steps = vec![balance("usdc.fakes.testnet", Check::OutputAfter(0))];
    callback(b"\"1\"", 1);
    drop(g.on_step(1));
    assert!(g.activity[0].ok);
}
#[test]
fn refunded_input_fails() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(Action::BurrowSupply {
        token: WRAP.parse().unwrap(),
        amount: U128(10),
        as_collateral: false,
    }));
    let p = g.pending.as_mut().unwrap();
    p.steps = vec![p.steps.last().unwrap().clone()];
    callback(b"\"0\"", 1);
    drop(g.on_step(1));
    assert_eq!(g.activity[0].reason, "INPUT_REFUNDED");
    assert!(g.pending.is_none());
}
#[test]
fn unstake_plan() {
    let g = guard();
    let p = g.plan(&Action::LinearUnstake { amount: U128(5) });
    assert_eq!(p[0].method, "unstake");
    assert_eq!(p[0].deposit, 0);
}
#[test]
#[should_panic(expected = "CAP_PER_ACTION")]
fn uncapped_asset() {
    let mut g = guard();
    agent();
    g.charge("unknown.testnet", 1);
}
#[test]
#[should_panic(expected = "ZERO_AMOUNT")]
fn zero_amount() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(stake(0)));
}
#[test]
#[should_panic(expected = "INVALID_POLICY")]
fn invalid_slippage_policy() {
    let mut p = policy();
    p.max_slippage_bps = 10_001;
    Guard::validate(&p);
}
#[test]
#[should_panic(expected = "INVALID_CAP")]
fn invalid_cap_policy() {
    let mut p = policy();
    p.caps.get_mut("near").unwrap().daily = U128(1);
    Guard::validate(&p);
}
#[test]
#[should_panic(expected = "INVALID_ASSET")]
fn invalid_asset_policy() {
    let mut p = policy();
    p.caps.insert(
        "BAD ASSET".into(),
        Cap {
            per_action: U128(1),
            daily: U128(2),
        },
    );
    Guard::validate(&p);
}
#[test]
#[should_panic(expected = "OWNER_ONLY")]
fn init_only_self() {
    let mut b = context(2, 1);
    b.predecessor_account_id("other.testnet".parse().unwrap());
    testing_env!(b.build());
    Guard::init(pk(1), policy());
}
#[test]
#[should_panic(expected = "INVALID_PERP")]
fn invalid_perp_side() {
    let mut g = guard();
    agent();
    g.authorize_perp(ORDERLY_VENUE.into(), "ETH".into(), "wrong".into(), 50, 300);
}
#[test]
#[should_panic(expected = "PROTOCOL_NOT_ALLOWED")]
fn wrong_perp_venue() {
    let mut g = guard();
    agent();
    g.authorize_perp(REF.into(), "ETH".into(), "BUY".into(), 50, 300);
}
#[test]
fn wrapping_skipped_for_existing_balance() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(Action::BurrowSupply {
        token: WRAP.parse().unwrap(),
        amount: U128(10),
        as_collateral: false,
    }));
    callback(b"null", 1);
    drop(g.on_step(1));
    callback(b"\"10\"", 1);
    drop(g.on_step(1));
    assert_eq!(
        g.pending.as_ref().unwrap().steps[0].method,
        "storage_deposit"
    );
}
#[test]
fn malformed_balance_fails_closed() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(Action::BurrowSupply {
        token: WRAP.parse().unwrap(),
        amount: U128(10),
        as_collateral: false,
    }));
    callback(b"null", 1);
    drop(g.on_step(1));
    callback(b"not json", 1);
    drop(g.on_step(1));
    assert_eq!(g.activity[0].reason, "BALANCE_UNKNOWN");
}
#[test]
fn missing_output_is_never_success() {
    let mut g = guard();
    agent();
    let a = Action::RefSwap {
        pool_id: 1,
        token_in: WRAP.parse().unwrap(),
        token_out: "usdc.fakes.testnet".parse().unwrap(),
        amount_in: U128(10),
        min_amount_out: U128(2),
    };
    drop(g.agent_execute(a));
    g.pending.as_mut().unwrap().steps = vec![balance("usdc.fakes.testnet", Check::OutputAfter(1))];
    callback(b"\"1\"", 1);
    drop(g.on_step(1));
    assert!(!g.activity[0].ok);
    assert_eq!(g.pending.as_ref().unwrap().steps.len(), 1);
    callback(b"\"1\"", 1);
    drop(g.on_step(1));
    assert_eq!(g.activity[0].reason, "OUTPUT_NOT_DELIVERED");
    assert!(g.pending.is_none());
}
#[test]
fn pause_cancels_unissued_steps() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(Action::BurrowSupply {
        token: WRAP.parse().unwrap(),
        amount: U128(10),
        as_collateral: false,
    }));
    g.policy.paused = true;
    callback(b"\"10\"", 1);
    drop(g.on_step(1));
    assert_eq!(g.activity[0].reason, "CANCELLED");
    assert!(g.pending.is_none());
}
#[test]
fn withdraw_supplied_needs_no_collateral_change() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(Action::BurrowWithdraw {
        token: WRAP.parse().unwrap(),
        amount: U128(10),
    }));
    callback(
        json!({"supplied":[{"token_id":WRAP,"balance":"20"}]})
            .to_string()
            .as_bytes(),
        1,
    );
    drop(g.on_step(1));
    let v: Value = serde_json::from_str(&g.pending.as_ref().unwrap().steps[0].args).unwrap();
    assert_eq!(v["actions"].as_array().unwrap().len(), 1);
    assert!(v["actions"][0].get("Withdraw").is_some());
}
#[test]
fn low_balance_during_wrap_releases_operation() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(Action::BurrowSupply {
        token: WRAP.parse().unwrap(),
        amount: U128(NEAR / 5),
        as_collateral: false,
    }));
    callback(b"null", 1);
    drop(g.on_step(1));
    let mut b = context(1, 1);
    b.account_balance(NearToken::from_millinear(310));
    testing_env!(
        b.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        std::collections::HashMap::default(),
        vec![PromiseResult::Successful(b"\"0\"".to_vec())]
    );
    drop(g.on_step(1));
    assert_eq!(g.activity[0].reason, "LOW_BALANCE");
    assert!(g.pending.is_none());
}
#[test]
fn owner_pause_releases_pending_without_resetting_cap() {
    let mut g = guard();
    agent();
    drop(g.agent_execute(stake(10)));
    testing_env!(context(2, 1).build());
    g.pause();
    assert!(g.pending.is_none());
    assert_eq!(g.activity[0].reason, "CANCELLED");
    assert_eq!(g.spent["near"].amount.0, 10);
    callback(b"null", 1);
    drop(g.on_step(1));
    assert_eq!(g.activity[0].reason, "CANCELLED");
}
