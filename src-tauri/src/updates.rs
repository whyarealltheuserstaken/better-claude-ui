//! Pure helpers for the in-app updater: result and error shapes the UI consumes, plain-language
//! error messages, and the safety checks around downloads. The network, signature verification
//! and installation are done by `tauri-plugin-updater`; signature verification is mandatory and
//! uses the public key in `tauri.conf.json`.

use serde::Serialize;
use tauri_plugin_updater::Error as PluginError;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UpdateInfo {
    /// False when the installed version is the newest one.
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    /// Release notes (trimmed), if the release has any.
    pub notes: Option<String>,
    /// Publish date as Unix seconds.
    pub date: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ProblemKind {
    /// Could not reach the update server.
    Offline,
    /// The server answered but has no usable release information for this platform.
    NoReleaseInfo,
    /// The downloaded update failed verification and was NOT installed.
    Unverified,
    /// Misconfiguration of this build (endpoint, key, format).
    BuildConfig,
    /// Disk or installer problem.
    Install,
    Other,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UpdateProblem {
    pub kind: ProblemKind,
    /// Safe to show to the user.
    pub message: String,
    /// Technical detail for the Advanced view and bug reports.
    pub detail: String,
}

impl UpdateProblem {
    fn new(kind: ProblemKind, message: &str, detail: String) -> Self {
        Self {
            kind,
            message: message.into(),
            detail,
        }
    }

    pub fn other(message: &str) -> Self {
        Self::new(ProblemKind::Other, message, message.into())
    }
}

/// Turn a plugin error into something a person can act on.
pub fn classify(e: &PluginError) -> UpdateProblem {
    let detail = e.to_string();
    match e {
        // A response that arrived but could not be decoded (for example a manifest that is not
        // valid JSON) is the server's problem, not the user's connection.
        PluginError::Reqwest(r) if r.is_decode() || r.is_status() => UpdateProblem::new(
            ProblemKind::NoReleaseInfo,
            "The update server didn't have usable update information for this computer.",
            detail,
        ),
        PluginError::Reqwest(_) | PluginError::Network(_) => UpdateProblem::new(
            ProblemKind::Offline,
            "Couldn't reach the update server. Check your internet connection and try again.",
            detail,
        ),
        PluginError::ReleaseNotFound
        | PluginError::TargetNotFound(_)
        | PluginError::TargetsNotFound(_)
        | PluginError::Serialization(_) => UpdateProblem::new(
            ProblemKind::NoReleaseInfo,
            "The update server didn't have usable update information for this computer.",
            detail,
        ),
        PluginError::Minisign(_)
        | PluginError::Base64(_)
        | PluginError::SignatureUtf8(_)
        | PluginError::SignedVersionMismatch { .. } => UpdateProblem::new(
            ProblemKind::Unverified,
            "The update couldn't be verified, so it was not installed. This protects you from tampered files.",
            detail,
        ),
        PluginError::EmptyEndpoints
        | PluginError::InsecureTransportProtocol
        | PluginError::UrlParse(_)
        | PluginError::InvalidUpdaterFormat => UpdateProblem::new(
            ProblemKind::BuildConfig,
            "Updates aren't set up correctly in this build. Please download the latest version from the project page.",
            detail,
        ),
        PluginError::Io(_)
        | PluginError::TempDirNotFound
        | PluginError::TempDirNotOnSameMountPoint
        | PluginError::PreviousAppNotRestored(_)
        | PluginError::FailedToDetermineExtractPath
        | PluginError::BinaryNotFoundInArchive
        | PluginError::PackageInstallFailed
        | PluginError::DebInstallFailed
        | PluginError::AuthenticationFailed => UpdateProblem::new(
            ProblemKind::Install,
            "The update couldn't be installed. Your current version is unchanged.",
            detail,
        ),
        _ => UpdateProblem::new(
            ProblemKind::Other,
            "Couldn't check for updates right now. Please try again later.",
            detail,
        ),
    }
}

/// Release builds only install updates fetched over HTTPS. (The signature is the real
/// protection; this removes an easy downgrade of the transport.) Debug builds may use plain
/// HTTP so a local test server can be used.
pub fn download_url_allowed(scheme: &str, debug_build: bool) -> bool {
    scheme.eq_ignore_ascii_case("https") || debug_build
}

pub const MAX_NOTES_CHARS: usize = 4000;

/// Release notes, trimmed and capped; None when empty.
pub fn trim_notes(notes: Option<&str>) -> Option<String> {
    let n = notes?.trim();
    if n.is_empty() {
        return None;
    }
    if n.chars().count() <= MAX_NOTES_CHARS {
        return Some(n.to_string());
    }
    let cut: String = n.chars().take(MAX_NOTES_CHARS).collect();
    Some(format!("{}…", cut.trim_end()))
}

/// Parse and validate an endpoint override (debug builds only use this).
pub fn parse_endpoint(raw: &str) -> Option<url::Url> {
    let u = url::Url::parse(raw.trim()).ok()?;
    matches!(u.scheme(), "http" | "https").then_some(u)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn network_errors_say_check_your_connection() {
        let p = classify(&PluginError::Network("dns".into()));
        assert_eq!(p.kind, ProblemKind::Offline);
        assert!(p.message.contains("internet connection"));
        assert_eq!(p.detail, "`dns`");
    }

    #[test]
    fn missing_release_info_is_not_blamed_on_the_user() {
        for e in [
            PluginError::ReleaseNotFound,
            PluginError::TargetNotFound("windows-x86_64".into()),
            PluginError::TargetsNotFound(vec!["a".into()]),
        ] {
            assert_eq!(classify(&e).kind, ProblemKind::NoReleaseInfo, "{e}");
        }
    }

    #[test]
    fn verification_failures_say_nothing_was_installed() {
        for e in [
            PluginError::SignatureUtf8("zzz".into()),
            PluginError::SignedVersionMismatch {
                signed: "1.0.0".into(),
                announced: "9.9.9".into(),
            },
        ] {
            let p = classify(&e);
            assert_eq!(p.kind, ProblemKind::Unverified, "{e}");
            assert!(p.message.contains("not installed"));
        }
    }

    #[test]
    fn build_config_errors_point_to_the_project_page() {
        for e in [
            PluginError::EmptyEndpoints,
            PluginError::InsecureTransportProtocol,
        ] {
            let p = classify(&e);
            assert_eq!(p.kind, ProblemKind::BuildConfig);
            assert!(p.message.contains("download the latest version"));
        }
    }

    #[test]
    fn install_failures_say_the_current_version_is_unchanged() {
        let p = classify(&PluginError::TempDirNotFound);
        assert_eq!(p.kind, ProblemKind::Install);
        assert!(p.message.contains("unchanged"));
    }

    #[test]
    fn user_messages_never_contain_technical_detail() {
        let p = classify(&PluginError::SignedVersionMismatch {
            signed: "1.0.0".into(),
            announced: "9.9.9".into(),
        });
        assert!(!p.message.contains("9.9.9"));
        assert!(p.detail.contains("9.9.9"));
    }

    #[test]
    fn release_builds_require_https_for_downloads() {
        assert!(download_url_allowed("https", false));
        assert!(download_url_allowed("HTTPS", false));
        assert!(!download_url_allowed("http", false));
        assert!(!download_url_allowed("file", false));
        assert!(download_url_allowed("http", true));
    }

    #[test]
    fn notes_are_trimmed_capped_and_empty_becomes_none() {
        assert_eq!(trim_notes(None), None);
        assert_eq!(trim_notes(Some("  \n ")), None);
        assert_eq!(trim_notes(Some("  hi  ")), Some("hi".into()));
        let long = "x".repeat(MAX_NOTES_CHARS + 50);
        let t = trim_notes(Some(&long)).unwrap();
        assert!(t.ends_with('…'));
        assert_eq!(t.chars().count(), MAX_NOTES_CHARS + 1);
    }

    #[test]
    fn endpoint_override_accepts_only_http_and_https() {
        assert!(parse_endpoint("http://127.0.0.1:9488/latest.json").is_some());
        assert!(parse_endpoint(" https://example.com/x ").is_some());
        assert!(parse_endpoint("file:///etc/passwd").is_none());
        assert!(parse_endpoint("javascript:alert(1)").is_none());
        assert!(parse_endpoint("nonsense").is_none());
    }

    #[test]
    fn update_info_serializes_for_the_ui() {
        let v = serde_json::to_value(UpdateInfo {
            available: true,
            current_version: "0.1.0".into(),
            version: Some("0.2.0".into()),
            notes: None,
            date: None,
        })
        .unwrap();
        assert_eq!(v["available"], true);
        assert_eq!(v["version"], "0.2.0");
        assert!(v["notes"].is_null());
    }
}
