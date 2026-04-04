pub mod service_card;
pub mod service_icon;
pub mod status_ring;
pub mod activity_panel;
pub mod sessions_panel;
pub mod plans_panel;
pub mod sprints_panel;
pub mod cartographer_panel;
pub mod chatbot_panel;
pub mod mcp_proxy_panel;
pub mod event_broadcast_panel;
pub mod settings_panel;
pub mod pairing_dialog;
pub mod about_panel;

/// Dark-theme colour constants shared across panel modules.
pub mod theme {
    use iced::Color;

    pub const BG_WINDOW:      Color = Color { r: 0.059, g: 0.075, b: 0.098, a: 1.0 };
    pub const BG_PANEL:       Color = Color { r: 0.086, g: 0.106, b: 0.133, a: 1.0 };
    pub const BG_CARD:        Color = Color { r: 0.110, g: 0.129, b: 0.157, a: 1.0 };
    pub const BORDER_SUBTLE:  Color = Color { r: 0.188, g: 0.212, b: 0.239, a: 1.0 };
    pub const TEXT_PRIMARY:   Color = Color { r: 0.788, g: 0.820, b: 0.851, a: 1.0 };
    pub const TEXT_SECONDARY: Color = Color { r: 0.545, g: 0.580, b: 0.620, a: 1.0 };
    pub const TEXT_ACCENT:    Color = Color { r: 0.345, g: 0.651, b: 1.000, a: 1.0 };
    pub const CLR_RUNNING:    Color = Color { r: 0.247, g: 0.725, b: 0.314, a: 1.0 };
    pub const CLR_STOPPED:    Color = Color { r: 0.973, g: 0.318, b: 0.286, a: 1.0 };
    pub const CLR_YELLOW:     Color = Color { r: 1.000, g: 0.922, b: 0.231, a: 1.0 };
    pub const CLR_BLUE:       Color = Color { r: 0.220, g: 0.545, b: 0.980, a: 1.0 };
}
