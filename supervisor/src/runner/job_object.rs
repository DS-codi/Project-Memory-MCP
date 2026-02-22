//! Child-process ownership via a Windows Job Object.
//!
//! Creates a single Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` at
//! supervisor startup.  Every Node.js / dashboard / terminal process is then
//! assigned to this job immediately after being spawned.
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
/// (`HANDLE = *mut c_void` is not `Sync`, but a `usize` is).  We never close
/// this handle intentionally — the OS reclaims it (and kills all job members)
/// when the process exits.
static JOB: OnceLock<usize> = OnceLock::new();

#[cfg(windows)]
fn init_windows() {
    if JOB.get().is_some() {
        return;
    }

    // SAFETY: pure Win32 read/create calls with no aliasing.
    unsafe {
        let handle = CreateJobObjectW(std::ptr::null_mut(), std::ptr::null());
        if handle.is_null() {
            eprintln!("[job] CreateJobObjectW failed — orphans may survive supervisor exit");
            return;
        }

        // Configure the job: kill all member processes when the last job
        // handle is closed (i.e. when this supervisor process exits).
        let mut info = JobObjectBasicLimitInformation {
            per_process_user_time_limit: 0,
            per_job_user_time_limit: 0,
            limit_flags: JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            minimum_working_set_size: 0,
            maximum_working_set_size: 0,
            active_process_limit: 0,
            affinity: 0,
            priority_class: 0,
            scheduling_class: 0,
        };

        let ok = SetInformationJobObject(
            handle,
            JOB_OBJECT_BASIC_LIMIT_INFORMATION,
            &mut info as *mut _ as *mut std::ffi::c_void,
            std::mem::size_of::<JobObjectBasicLimitInformation>() as u32,
        );

        if ok == 0 {
            eprintln!("[job] SetInformationJobObject failed — orphans may survive supervisor exit");
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
    let job = raw as *mut std::ffi::c_void;

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
            eprintln!("[job] AssignProcessToJobObject(PID={pid}) failed — process not owned by job");
        } else {
            eprintln!("[job] PID {pid} assigned to supervisor job object");
        }
    }
}

// ---------------------------------------------------------------------------
// Win32 constants and declarations
// ---------------------------------------------------------------------------

#[cfg(windows)]
const JOB_OBJECT_BASIC_LIMIT_INFORMATION: u32 = 2;

#[cfg(windows)]
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;

#[cfg(windows)]
const PROCESS_TERMINATE: u32 = 0x0001;

#[cfg(windows)]
const PROCESS_SET_QUOTA: u32 = 0x0100;

/// Mirrors `JOBOBJECT_BASIC_LIMIT_INFORMATION` from `winnt.h`.
#[cfg(windows)]
#[repr(C)]
struct JobObjectBasicLimitInformation {
    per_process_user_time_limit: i64, // LARGE_INTEGER
    per_job_user_time_limit: i64,     // LARGE_INTEGER
    limit_flags: u32,                 // DWORD
    minimum_working_set_size: usize,  // SIZE_T
    maximum_working_set_size: usize,  // SIZE_T
    active_process_limit: u32,        // DWORD
    affinity: usize,                  // ULONG_PTR
    priority_class: u32,              // DWORD
    scheduling_class: u32,            // DWORD
}

#[cfg(windows)]
extern "system" {
    fn CreateJobObjectW(
        lp_job_attributes: *mut std::ffi::c_void,
        lp_name: *const u16,
    ) -> *mut std::ffi::c_void;

    fn SetInformationJobObject(
        h_job: *mut std::ffi::c_void,
        job_object_information_class: u32,
        lp_job_object_information: *mut std::ffi::c_void,
        cb_job_object_information_length: u32,
    ) -> i32;

    fn OpenProcess(
        dw_desired_access: u32,
        b_inherit_handle: i32,
        dw_process_id: u32,
    ) -> *mut std::ffi::c_void;

    fn AssignProcessToJobObject(
        h_job: *mut std::ffi::c_void,
        h_process: *mut std::ffi::c_void,
    ) -> i32;

    fn CloseHandle(h_object: *mut std::ffi::c_void) -> i32;
}
