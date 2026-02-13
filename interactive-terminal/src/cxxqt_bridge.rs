use cxx_qt_lib::QString;

#[cxx_qt::bridge]
pub mod ffi {
    unsafe extern "C++" {
        include!("cxx-qt-lib/qstring.h");
        type QString = cxx_qt_lib::QString;
    }

    unsafe extern "RustQt" {
        #[qobject]
        #[qml_element]
        #[qproperty(QString, status_message, cxx_name = "statusMessage")]
        type TerminalApp = super::TerminalAppRust;
    }
}

#[derive(Default)]
pub struct TerminalAppRust {
    status_message: QString,
}
