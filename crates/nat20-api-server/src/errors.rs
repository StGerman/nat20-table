//! Building contract errors: one plain sentence, the right code, `retryable` from the code.

use nat20_api_contract::{ApiError, Awaiting, ErrorCode, ErrorHint, RejectReason};

/// An error with no `reason`; `retryable` follows contract/protocol.md §7.
pub fn error(code: ErrorCode, message: impl Into<String>) -> ApiError {
    let retryable = !matches!(
        code,
        ErrorCode::BadRequest
            | ErrorCode::UnsupportedVersion
            | ErrorCode::NoSession
            | ErrorCode::NoScene
            | ErrorCode::NotVisible
            | ErrorCode::WrongMode
            | ErrorCode::SurrenderNotAvailable
            | ErrorCode::NotImplemented
            | ErrorCode::BadScene
            | ErrorCode::Internal
    );
    ApiError {
        code,
        reason: None,
        message: message.into(),
        retryable,
        hint: None,
    }
}

/// A well-formed decision the engine refused.
pub fn rejected(reason: RejectReason, message: impl Into<String>) -> ApiError {
    ApiError {
        code: ErrorCode::Rejected,
        reason: Some(reason),
        message: message.into(),
        retryable: true,
        hint: None,
    }
}

/// `error` with the pending prompt attached as a hint.
pub fn with_awaiting(mut error: ApiError, awaiting: Awaiting) -> ApiError {
    error.hint = Some(ErrorHint {
        legal_option_ids: Vec::new(),
        awaiting: Some(awaiting),
        known_ids: Vec::new(),
    });
    error
}

/// A command the contract has and this engine build does not serve yet.
pub fn not_implemented(what: &str, why: &str) -> ApiError {
    error(
        ErrorCode::NotImplemented,
        format!("{what} is not implemented by this engine yet: {why}."),
    )
}
