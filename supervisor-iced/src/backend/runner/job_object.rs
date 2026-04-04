//! Child-process ownership via a Windows Job Object.
//!
//! Creates a single Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` at
//! supervisor startup.  Every spawned child process is then assigned to this
//! job immediately after being started.
//!
//! **Effect:** when the supervisor exits — including on a panic or hard-kill —
//! the OS automatically terminates every process in the job before the last
//! handle to the job object is closed.  No orphan processes are left behind.
//!
//! On non-Windows platforms the `adopt` call is a no-op; child processes
//! there receive SIGHUP when the parent exits, which is sufficient for
//! graceful cleanup.

use std::sync::OnceLock;

// ---------------------------------------------------------------------------
// Windows-sys imports (compile-time gated)
// ---------------------------------------------------------------------------

#[cfg(windows)]
use windows_sys::Win32::Foundation::CloseHandle;

#[cfg(windows)]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicLimitInformation,
    SetInformationJobObject, JOBOBJECT_BASIC_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};

#[cfg(windows)]
use windows_sys::Win32::System::Threading::{
    OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Initialise the supervisor Job Object.
///
/// Must be called **once** at startup before any child processes are spawned.
/// Subsequent calls are no-ops.
pub fn init() {
    #[cfg(windows)]
    init_windows();
}

/// Assign the process identified by `pid` to the supervisor Job Object so
/// that it is automatically killed when the supervisor exits.
///
/// Logs a warning if the assignment fails (e.g. the process is already a
/// member of a non-nested job from a previous Windows version) but never
/// panics.
pub fn adopt(pid: u32) {
    #[cfg(windows)]
    adopt_windows(pid);

    #[cfg(not(windows))]
    let _ = pid;
}

// ---------------------------------------------------------------------------
// Windows implementation
// ---------------------------------------------------------------------------

/// Raw HANDLE stored as `usize` so it can live in a `OnceLock<usize>`
/// (`HANDLE = isize` is not `Sync` when wrapped in a pointer, but a `usize`
/// is).  We never close this handle intentionally — the OS reclaims it (and
/// kills all job members) when the process exits.
static JOB: OnceLock<usize> = OnceLock::new();

#[cfg(windows)]
fn init_windows() {
    if JOB.get().is_some() {
        return;
    }

    // SAFETY: pure Win32 read/create calls with no aliasing.
    unsafe {
        // lpJobAttributes = null  →  default security, not inheritable
        // lpName          = null  →  unnamed job object
        let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if handle == std::ptr::null_mut() {
            eprintln!("[job] CreateJobObjectW failed — orphans may survive supervisor exit");
            return;
        }

        // Configure the job: kill all member processes when the last job
        // handle is closed (i.e. when this supervisor process exits).
        let mut info = JOBOBJECT_BASIC_LIMIT_INFORMATION {
            PerProcessUserTimeLimit: 0,
            PerJobUserTimeLimit: 0,
            LimitFlags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            MinimumWorkingSetSize: 0,
            MaximumWorkingSetSize: 0,
            ActiveProcessLimit: 0,
            Affinity: 0,
            PriorityClass: 0,
            SchedulingClass: 0,
        };

        let ok = SetInformationJobObject(
            handle,
            // JobObjectBasicLimitInformation == 2 — selects the
            // JOBOBJECT_BASIC_LIMIT_INFORMATION information class.
            JobObjectBasicLimitInformation,
            &mut info as *mut _ as *mut _,
            std::mem::size_of::<JOBOBJECT_BASIC_LIMIT_INFORMATION>() as u32,
        );

        if ok == 0 {
            eprintln!(
                "[job] SetInformationJobObject failed — orphans may survive supervisor exit"
            );
            CloseHandle(handle);
            return;
        }

        // Intentionally leak the handle.  It must remain open for the entire
        // supervisor lifetime; the OS releases it (and kills all job members)
        // when the process exits.
        let _ = JOB.set(handle as usize);
        println!("[job] supervisor job object created — child processes will be owned");
    }
}

#[cfg(windows)]
fn adopt_windows(pid: u32) {
    let Some(&raw) = JOB.get() else {
        // init() was not called or failed silently.
        return;
    };

    #[allow(clippy::cast_possible_wrap)]
    let job = raw as windows_sys::Win32::Foundation::HANDLE;

    // SAFETY: Win32 calls with a valid PID and our owned job handle.
    unsafe {
        let proc = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, 0, pid);
        if proc.is_null() {
            eprintln!("[job] OpenProcess(PID={pid}) failed — process not owned by job");
            return;
        }

        let ok = AssignProcessToJobObject(job, proc);
        // Always close the temporary process handle; the job keeps its own
        // internal reference to the process.
        CloseHandle(proc);

        if ok == 0 {
            eprintln!(
                "[job] AssignProcessToJobObject(PID={pid}) failed — process not owned by job"
            );
        } else {
            eprintln!("[job] PID {pid} assigned to supervisor job object");
        }
    }
}
