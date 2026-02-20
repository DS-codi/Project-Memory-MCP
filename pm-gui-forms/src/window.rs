//! Window configuration helpers.
//!
//! Pure Rust data consumed by consumer binary CxxQt bridges to
//! configure the Qt `ApplicationWindow`.

use crate::protocol::config::WindowConfig;
use crate::protocol::envelope::FormType;

/// Return sensible window defaults for a given [`FormType`].
pub fn default_window_config(form_type: FormType) -> WindowConfig {
    match form_type {
        FormType::Brainstorm => WindowConfig {
            always_on_top: false,
            width: 900,
            height: 700,
            title: "Brainstorm".to_string(),
        },
        FormType::Approval => WindowConfig {
            always_on_top: true,
            width: 500,
            height: 350,
            title: "Approval Required".to_string(),
        },
    }
}

/// Merge user-supplied config with defaults for the form type.
///
/// Any field that is at its "zero" or default value in `user` is
/// replaced with the form-type default.
pub fn merge_with_defaults(user: &WindowConfig, form_type: FormType) -> WindowConfig {
    let defaults = default_window_config(form_type);
    WindowConfig {
        always_on_top: user.always_on_top || defaults.always_on_top,
        width: if user.width == 0 {
            defaults.width
        } else {
            user.width
        },
        height: if user.height == 0 {
            defaults.height
        } else {
            user.height
        },
        title: if user.title.is_empty() {
            defaults.title
        } else {
            user.title.clone()
        },
    }
}
