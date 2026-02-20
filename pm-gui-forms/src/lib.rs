//! # pm-gui-forms
//!
//! Shared library crate for Project Memory GUI form applications.
//!
//! Provides:
//! - **Protocol types** — `FormRequest`, `FormResponse`, question/answer enums,
//!   refinement messages, and typed wrappers for Brainstorm and Approval flows.
//! - **NDJSON transport** — `FormTransport` trait with `StdioTransport` for
//!   stdin/stdout line-delimited JSON communication.
//! - **Countdown timer** — Pure Rust tick-based timer with pause/resume.
//! - **Window config** — Sizing and flag helpers consumed by consumer binaries.
//!
//! This crate is intentionally free of CxxQt / Qt dependencies. Each consumer
//! binary (`pm-brainstorm-gui`, `pm-approval-gui`) defines its own CxxQt bridge
//! that depends on these types.

pub mod protocol;
pub mod timer;
pub mod transport;
pub mod window;
