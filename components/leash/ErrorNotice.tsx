import { errorDetail, friendlyError } from "./friendly-error";

export function ErrorNotice({
  error,
  className = "integration-notice",
}: {
  error: unknown;
  className?: string;
}) {
  const { title, hint } = friendlyError(error);
  const detail = errorDetail(error);
  return (
    <div role="alert" className={className}>
      <p>{title}</p>
      {hint && <p>{hint}</p>}
      {title === "Something went wrong — try again" &&
        detail &&
        detail !== title && (
          <details className="error-details">
            <summary>Details</summary>
            <p>{detail}</p>
          </details>
        )}
    </div>
  );
}
