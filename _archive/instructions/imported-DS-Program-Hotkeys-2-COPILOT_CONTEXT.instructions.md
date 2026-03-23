# DS-Program-Hotkeys: AI Assistant Context Prompt

## System Overview
You are assisting with the **DS-Program-Hotkeys** system - a comprehensive stone fabrication automation suite that combines AutoHotkey scripts and Python utilities to streamline manufacturing workflows. This is a professional industrial automation system used in stone cutting, templating, and job management operations.

## Core Technologies
- **Primary Languages**: Python 3.9+, AutoHotkey v2.0+
- **GUI Framework**: PySide6 for modern Qt6-based interfaces
- **Database**: SQLite for job/user data persistence
- **Message Broker**: Custom TCP-based pub/sub system for inter-process communication
- **Architecture**: Modular, event-driven design with shared state management
- **Target Environment**: Windows workstations and network deployments

## System Purpose & Context
The DS-Program-Hotkeys system automates stone fabrication workflows by:
- **Hotkey Automation**: AutoHotkey scripts for CAD software (Stone-Pro), cutting machines (TOP10), waterjet systems
- **Job Management**: Complete project lifecycle from creation to completion with database tracking
- **Utility Integration**: PDF processing, DXF conversion, image manipulation, calculators
- **Network Deployment**: Multi-user support with individual workspaces and shared resources
- **Notion Integration**: Bidirectional sync with Notion for job assignment and tracking
- **Paperwork Automation**: Automatic PDF compilation for job documentation

## Vendor System & External Dependencies

### **Vendor Directory Structure**
The `/vendor/` directory contains portable installations of external dependencies, enabling standalone deployment without requiring users to install software:

**Vendor Python Installation**:
- **Location**: `/vendor/python/python.exe`
- **Purpose**: Execute `/python_scripts/` utilities independently of user Python installations
- **Priority**: Highest priority in Python executable detection
- **Benefits**: Consistent execution environment, no dependency on user system Python
- **Setup**: Copy complete Python installation to vendor directory (see `/vendor/README.md`)

**Other Vendor Components**:
- **AutoHotkey v2**: `/vendor/autohotkey/AutoHotkey.exe` - Portable AHK installation
- **LibreOffice Portable**: `/vendor/libreoffice/` - PDF processing capabilities (external download)
- **GIMP Portable**: `/vendor/gimp/` - Image processing for cutting sheets (external download)

### **External Script Independence**
Python scripts in `/python_scripts/` are designed to run independently using the vendor Python installation:
- **Isolation**: Scripts run with clean environment, separate from main application
- **Portability**: Vendor Python ensures scripts work regardless of user system configuration  
- **Consistency**: Same Python version and packages across all deployments
- **User Independence**: Scripts don't rely on user-installed Python or packages

## Application Entry Point
**Primary Entry Point**: `/core/user_launcher.py`
- This is the main entry point for starting the DS-Program-Hotkeys application
- Handles application initialization, user detection, and launches the main interface
- Run with: `python core/user_launcher.py` from the project root directory

## Key Components

### 🏗️ **Architecture**
```
DS-Program-Hotkeys/
├── core/                    # Core Python modules
│   ├── user_launcher.py     # Main application entry point
│   ├── ahk_launcher.py      # AHK script management and toolbar
│   ├── database/            # SQLite database modules (jobs, users, parsers)
│   ├── extensions/          # Job extension system (remakes, fixups)
│   ├── tracing/             # Application tracing and debugging
│   ├── paperwork_*.py       # Paperwork compilation system
│   └── notion_*.py          # Notion integration services
├── ui/                      # PySide6 UI components with Qt Designer files
│   ├── unified_main_window.py    # Single-window architecture with stacked views
│   ├── shared_application_state.py  # Centralized state management
│   ├── fullscreen_overview.py   # Job cards and management interface
│   ├── toolbar_view.py          # Compact toolbar mode
│   └── *.ui                     # Qt Designer UI definitions
├── ahk_scripts/            # AutoHotkey automation scripts (legacy, editable)
├── ahk_scripts_unified/    # Refactored AHK scripts with shared libraries
│   ├── common/             # Shared AHK modules
│   ├── cad/                # CAD-specific hotkeys
│   ├── saw123/             # Saw 1-3 shared hotkeys
│   ├── saw4/               # Saw 4 hotkeys
│   ├── secam/              # SECAM machine hotkeys
│   ├── waterjet/           # Waterjet hotkeys
│   └── global/             # Global system hotkeys
├── ahk_manager/            # Standalone AHK control panel GUI
│   ├── core/               # Broker integration, config
│   ├── ui/                 # PySide6 control panel UI
│   └── dialogs/            # Popup dialogs (VDF browser, machine selection)
├── message_broker/         # IPC message broker system
│   ├── broker.py           # Central message broker server
│   ├── client.py           # Async client for Python apps
│   ├── qt_client.py        # Qt-integrated broker client
│   └── ahk_bridge.py       # AHK-to-Python bridge
├── launcher/               # Unified launcher orchestration
│   ├── main.py             # UnifiedLauncher class
│   ├── process_manager.py  # Component process management
│   └── health_monitor.py   # Health monitoring and recovery
├── python_scripts/         # Python utility scripts (external, editable)
├── jobs/                   # Job configuration files (.ini format)
├── users/[username]/       # Personal user directories (auto-created)
├── config/                 # Configuration files (JSON, YAML)
│   ├── unified_scripts.json    # Script definitions and mappings
│   ├── default_settings.yaml   # Default application settings
│   └── *.schema.json           # JSON schema validation files
├── assets/                 # Icons, splash screens, documentation
├── documentation/          # Comprehensive guides and technical docs
├── vendor/                 # Vendored dependencies for standalone deployment
│   ├── python/             # Portable Python installation
│   ├── autohotkey/         # Portable AutoHotkey v2 installation
│   ├── libreoffice/        # LibreOffice Portable (external)
│   └── gimp/               # GIMP Portable (external)
├── ds_pas/                 # ⚠️ STANDALONE MVC application (see rules below)
└── Inventory_Management_System/ # Advanced inventory tracking
```

### ⚠️ **DS-PAS Standalone Architecture (CRITICAL)**

**`ds_pas/` is a completely standalone, self-contained application.**

**RULES - NEVER VIOLATE:**
1. **NO imports from legacy code** - Never import from `core/`, `ui/`, `utilities/`
2. **Copy, don't reference** - All functionality must be copied INTO `ds_pas/` and refactored
3. **Own everything** - All models, services, views, utilities must exist within `ds_pas/`
4. **Separate packaging** - `ds_pas/` has its own PyInstaller spec, NOT bundled with launcher

**Allowed external references:**
- Third-party packages (PySide6, pyodbc, sqlite3, etc.)
- Python standard library
- Config files in `config/` (read-only)
- User data in `users/` (read/write)
- External tools via subprocess/messaging only

**WRONG:**
```python
from core.database.jobs_database import JobsDatabase  # ❌ NEVER
from ui.main_window import MainWindow                 # ❌ NEVER
```

**CORRECT:**
```python
from ds_pas.services.database import JobsRepository   # ✅ Internal
from ds_pas.views import MainWindow                   # ✅ Internal
```

See `documentation/CHECKLIST-ds_pas-migration.md` for full migration status.

### 🚀 **Main Applications**
**Entry Point**: `/core/user_launcher.py` - Primary application entry point (legacy launcher)

1. **DS-PAS** - Standalone MVC application (`/ds_pas/`) - **NEW, STANDALONE**
2. **UnifiedMainWindow** - Legacy single-window Qt application (`/ui/`)
3. **AHK Manager** - Standalone control panel for AHK script management (`/ahk_manager/`)
4. **Message Broker** - IPC coordination server (`/message_broker/`)
5. **Unified Launcher** - Process orchestration (`/launcher/`)
6. **Setup Assistant** - Automated installation and configuration tool

### 🎛️ **UI Architecture**
The application uses a **unified single-window architecture**:
- **UnifiedMainWindow**: Single QMainWindow with QStackedWidget for instant view switching
- **SharedApplicationState**: Centralized state management eliminating sync issues
- **ToolbarView**: Compact mode for quick script launching
- **FullscreenJobOverview**: Expanded mode with job cards, detail tabs, and management

### 📡 **Message Broker System**
Inter-process communication via custom message broker:
- **Async Protocol**: JSON-RPC style messages over TCP
- **Pub/Sub**: Topic-based subscription for events
- **Client Types**: Python async client, Qt-integrated client, AHK bridge
- **Use Cases**: AHK-to-Python communication, component coordination, event broadcasting

### 🎯 **Target Applications**
- **Stone-Pro CAD** (stoneprocad.exe) - Stone design and cutting optimization
- **TOP10** (TOP10.exe) - CNC cutting machine control software  
- **Various Waterjet Systems** - Precision cutting automation
- **PDF/DXF Workflows** - File format conversion and processing

## User Experience Design

### **Professional Interface**
- **Animated splash screen** with company branding
- **Modern toolbar design** with real-time status indicators
- **Job management integration** with active project tracking
- **Fullscreen overview mode** with paginated job cards (18 per page)

### **Intelligent User Management**
- **Automatic user detection** and workspace creation
- **Personal configuration isolation** in `users/[username]/`
- **Network deployment support** with shared scripts and individual data
- **Smart configuration management** with defaults and user overrides

### **Job Management Workflow**
1. **Job Creation** - Automated directory structure setup
2. **Active Job Tracking** - Current project integration across all tools
3. **Inventory Management** - Materials, programs, and cutting sheets
4. **Completion Tracking** - Archive and history management

## Development Guidelines

### **Code Standards**
- **Python**: Follow PEP 8, use type hints, comprehensive error handling
- **AutoHotkey**: v2.0+ syntax, modular script design, proper commenting
- **Configuration**: JSON/YAML configs with schema validation
- **Logging**: Comprehensive logging for debugging and user support
- **Cross-Environment Compatibility**: All code must work in both PyInstaller packaged executables and .venv development environments
- **State Management**: Use SharedApplicationState for centralized state, emit signals for changes

### **File Organization**
- **External Scripts**: `ahk_scripts/` and `python_scripts/` are user-editable
- **Unified AHK Scripts**: `ahk_scripts_unified/` contains refactored modular scripts
- **Core Modules**: `core/` contains the main application logic
- **UI Components**: `ui/` contains modular interface components with Qt Designer files
- **User Data**: Individual user directories with personal settings
- **Configuration**: Centralized config management with user overrides

### **Cross-Environment Development**
**Critical Requirement**: All code must be compatible with both deployment environments:

**PyInstaller Packaged Environment (.exe)**:
- Resources bundled in `_internal/` directory or `sys._MEIPASS`
- Use `getattr(sys, 'frozen', False)` to detect packaged mode
- Handle resource paths with `sys._MEIPASS` fallback
- Example: `base_path = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path(__file__).parent`

**Development Environment (.venv)**:
- Resources in source directory structure
- Standard Python import and path resolution
- Direct file system access to project files

**Best Practices**:
- Always use resource path helpers that handle both environments
- Test imports and file access in both modes
- Use relative imports and avoid hardcoded paths
- Implement fallback mechanisms for resource loading

### **Key Classes & Modules**
- **user_launcher.py**: Application entry point and main launcher
- **UnifiedMainWindow**: Single-window application with stacked views
- **SharedApplicationState**: Centralized state shared between views
- **FullscreenJobOverview**: Job management interface with pagination
- **ToolbarView**: Compact toolbar mode
- **CreateJobDialog**: New job creation with directory validation
- **JobsDatabase**: SQLite database for job data persistence
- **ExtensionManager**: Job extension (remake/fixup) management
- **MessageBroker**: IPC coordination server
- **AHKManagerApplication**: Standalone AHK control panel
- **SetupAssistant**: Automated installation and setup

## AutoHotkey Script Architecture

### 🔧 **Core Support Libraries**
All hotkey scripts utilize shared libraries in `ahk_scripts/` and `ahk_scripts_unified/common/`:

#### **PathResolver.ahk**
- **Purpose**: Dynamic program path resolution with user-specific overrides
- **Functionality**: 
  - Resolves program paths from `program_paths.ini` configuration
  - Supports user-specific path overrides in `users/[username]/program_paths.ini`
  - Provides fallback alternate path checking
  - Handles missing program prompts with file browser
- **Key Functions**:
  - `GetProgramPath(programKey)` - Main path resolution function
  - `GetWindowIdentifier(programKey)` - Returns appropriate window identifier
  - `SaveUserProgramPath(programKey, path)` - Saves user-specific paths

#### **GuiPositionManager.ahk**
- **Purpose**: Persistent GUI window position and size management
- **Functionality**:
  - Saves/restores window positions between script sessions
  - Supports user-specific position storage
  - Validates positions are on visible monitors
  - Provides fallback positioning for invalid saved positions
- **Key Functions**:
  - `SavePosition(guiObject, scriptName, windowName)` - Save current position
  - `LoadPosition(scriptName, windowName)` - Load saved position
  - `RestorePosition(guiObject, scriptName, windowName)` - Apply saved position

### 📁 **Unified AHK Scripts Structure**
The `ahk_scripts_unified/` directory contains refactored modular scripts:

```
ahk_scripts_unified/
├── common/         # Shared modules and utilities
├── cad/           # CAD_Hotkeys.ahk and CAD-specific functions
├── saw123/        # Shared hotkeys for Saw 1, 2, 3
├── saw4/          # Saw 4 specific hotkeys
├── secam/         # SECAM machine hotkeys
├── waterjet/      # Waterjet system hotkeys
├── global/        # Global system hotkeys (always active)
├── icons/         # Machine-specific icons
└── test/          # Test scripts
```

### 🏭 **Machine-Specific Hotkey Scripts**

#### **TOP10 Program Family (Same Base Software)**
These scripts control identical TOP10 software but on different physical machines:

**Saw1_Hotkeys.ahk, Saw2_Hotkeys.ahk, Saw3_Hotkeys.ahk, Saw3_Ceramic_Hotkeys.ahk**
- **Program**: TOP10.exe (identical interface across all saws)
- **Shared Features**: 
  - Same tab detection system (Preparation, Processing, etc.)
  - Identical hotkey mappings and automation sequences
  - Common file handling and optimization workflows
  - Shared unload processing and job management functions
- **Minor Differences**: 
  - Machine-specific working directories
  - Unique tray icons (Saw1_icon.ico, Saw2_icon.ico, etc.)
  - Machine-specific program path keys (Saw1_Program, Saw2_Program, etc.)
- **Code Reusability**: ~95% shared functionality - hotkeys can be copied between these scripts with minimal path adjustments

**Saw4_Hotkeys.ahk**
- **Program**: TOP10.exe (same base software)
- **Differences**: Unique tab positioning coordinates, specialized for Saw4 machine configuration
- **Shared Elements**: Core automation logic, file handling, optimization workflows

#### **SECAM Program Family (Similar Software Base)**
These scripts control SECAM software installations with significant shared functionality:

**SecamWJ_Hotkeys.ahk, SecamColbalm_Hotkeys.ahk, SecamThibaut_Hotkeys.ahk**
- **Program**: Secam10.exe (consistent interface across installations)
- **Shared Features**:
  - **Printing Functions**: All use identical `PrintWindow()` function for PDF generation
  - **Tab Detection**: Same tab names and detection system (Preparation, Processing, Output, Printout, LaserContour)
  - **File Management**: Common save/load workflows and directory handling
  - **Interface Automation**: Shared click coordinates and dialog handling
- **Minor Differences**:
  - Machine-specific program paths and working directories
  - Unique icons and script identifiers
  - Specialized processing for different waterjet systems
- **Code Reusability**: ~80% shared functionality, especially printing and file management

#### **Unique Specialized Scripts**

**WJ_Hotkeys.ahk** 
- **Program**: TOP10.exe (waterjet-specific configuration)
- **Unique Features**: Specialized for waterjet cutting operations
- **Shared Elements**: Basic TOP10 interface handling with waterjet-specific automation

**CAD_Hotkeys.ahk**
- **Program**: stoneprocad.exe (Stone-Pro CAD software)
- **Unique Features**: 
  - Does NOT include PathResolver.ahk (uses fixed executable path)
  - Specialized for CAD design and optimization workflows
  - Integration with StoneProOffice.exe
  - Complex inventory table management
  - CAD-specific file and drawing operations

### 🔗 **Program File Launch Integration**

#### **open_program_file.ahk**
- **Purpose**: Bridges fullscreen job overview program file launches with appropriate hotkey scripts
- **Functionality**:
  - Reads program configuration from user's launch config
  - Maps program groups to corresponding AHK scripts
  - Launches appropriate hotkey script with `--open-file` parameter
  - Special handling for CAD files (direct launch vs AHK script)
- **Integration**: Connected to fullscreen overview's program file launch method

#### **Program Group Mappings**
```
CAD → CAD_Hotkeys.ahk
Saw1 → Saw1_Hotkeys.ahk  
Saw2 → Saw2_Hotkeys.ahk
Saw3 → Saw3_Hotkeys.ahk
Saw3_Ceramic → Saw3_Ceramic_Hotkeys.ahk
Saw4 → Saw4_Hotkeys.ahk
SecamColbalm → SecamColbalm_Hotkeys.ahk
SecamThibaut → SecamThibaut_Hotkeys.ahk  
SecamWJ → SecamWJ_Hotkeys.ahk
WJ → WJ_Hotkeys.ahk
```

### 📋 **Configuration Management**

#### **unified_scripts.json**
- **Location**: `config/unified_scripts.json`
- **Purpose**: Central script configuration with full metadata
- **Structure**: Defines each script with key, name, script path, icon, category, target_exe, IPC settings, quick actions config
- **Schema**: Validated against `config/scripts.schema.json`

#### **program_paths.ini**
- **Location**: `ahk_scripts/program_paths.ini` (default) + `users/[username]/program_paths.ini` (user overrides)
- **Purpose**: Maps program keys to executable paths with alternate fallback locations
- **Structure**: 
  - `[ProgramPaths]` - Primary installation paths
  - `[AlternatePaths]` - Backup locations for automatic discovery

#### **default_settings.yaml**
- **Location**: `config/default_settings.yaml`
- **Purpose**: Default application settings with schema validation
- **User Override**: Settings stored in user database, merged with defaults

#### **Script Initialization Pattern**
All hotkey scripts follow consistent initialization:
1. Include required libraries (GuiPositionManager.ahk, PathResolver.ahk)
2. Check for `--open-file` command line parameter
3. Set up tray icon and error handling
4. Initialize program path resolution
5. Set up global variables and GUI elements
6. Register hotkey definitions with target window checking

### 🔄 **Development & Maintenance Guidelines**

#### **Code Sharing Best Practices**
- **TOP10 Family**: Hotkeys are nearly 100% interchangeable between Saw1/2/3/3_Ceramic
- **SECAM Family**: Printing functions and core automation can be shared across all SECAM scripts  
- **PathResolver Integration**: Always use dynamic path resolution for program launching
- **GUI Management**: Utilize GuiPositionManager for consistent window behavior
- **Error Handling**: Follow established patterns for graceful degradation

#### **Testing Considerations**
- Test path resolution with missing programs
- Verify GUI position persistence across sessions
- Validate hotkey functionality with target program windows
- Check user-specific configuration override behavior

### **UI Architecture & Components**
The `ui/` directory contains modular PySide6 components with centralized state management:

**Core Architecture:**
- **unified_main_window.py**: Single QMainWindow with QStackedWidget for instant view switching
- **shared_application_state.py**: Centralized state eliminating synchronization issues between views
- **Qt Designer Integration**: `.ui` files designed in Qt Designer with corresponding Python classes

**View Components:**
- **toolbar_view.py**: Compact toolbar mode for quick script launching
- **fullscreen_overview.py**: Expanded job cards view with pagination (18 jobs per page)
- **job_detail_tabs.py**: Tabbed interface for job details, pieces, programs, files
- **job_checklist_widget.py**: Progress tracking sidebar with completion checkmarks

**Dialog Components:**
- **create_job_dialog.py/.ui**: New job creation with directory validation
- **settings_dialog.py/.ui**: Application settings and preferences
- **cutting_sheets_opener.py/.ui**: GIMP integration for cutting sheet processing
- **calculators_dialog.py**: Arc segment, mitre join calculators

**Notion Integration UI:**
- **notion_jobs_tab.py/.ui**: Browse and import jobs from Notion
- **notion_archive_tab.py/.ui**: Archive browser with assignment tracking
- **notion_sync_status_widget.py**: Sync status indicators

**Paperwork UI:**
- **paperwork_widgets.py**: Document discovery and compilation interface

**UI Design Principles:**
- **Single Window Architecture**: QStackedWidget enables instant view switching without window creation overhead
- **Shared State Pattern**: All views read from SharedApplicationState, call methods to modify
- **Signal-Based Updates**: State changes emit signals, views update displays reactively
- **Professional Appearance**: Modern, clean interfaces suitable for industrial environments

### **Database Architecture**
The `core/database/` module provides SQLite persistence:

**Main Databases:**
- **jobs.db**: Shared job data, materials, files, pieces, cutting programs
- **user.db**: Per-user configuration, job history, preferences

**Key Modules:**
- **jobs_database.py**: JobsDatabase class with job CRUD, piece tracking, file discovery
- **user_database.py**: UserDatabase class for per-user data
- **xml_piece_parser.py**: Parse Stone-Pro XML exports for piece data
- **l2p_parser.py**: Edge profile to machine mapping
- **slab_mapper.py**: Map pieces to slabs from TOP files
- **slab_cutting_parser.py**: Parse slab cutting programs
- **cutout_top_parser.py**: Parse cutout programs
- **top_parser_factory.py**: Unified TOP file type detection and parsing
- **tab_data_discovery.py**: Automated file parsing and data extraction
- **piece_image_generator.py**: Generate piece images from CAD PDFs

### **Job Extension System**
The `core/extensions/` module manages job extensions:

**Extension Types:**
- **Remake**: Pieces need re-cutting due to damage or errors
- **Fixup**: Minor fixes or adjustments to existing pieces
- **Next Install**: Additional installation phase for the job

**Functionality:**
- Creates dedicated extension folders within job directory
- Tracks extension state and completion in database
- Maintains parent job context while switching working directories

### **Notion Integration**
Bidirectional sync with Notion for job management:

**Core Services:**
- **notion_archive_db.py**: NotionArchive database interface
- **notion_job_sync.py**: Bidirectional sync service with conflict resolution

**Capabilities:**
- Import jobs from Notion with assignment tracking
- Sync job status updates back to Notion
- Handle conflicts between local and remote data

### **Paperwork Compilation System**
Automated PDF document assembly:

**Components:**
- **paperwork_document_service.py**: Document type discovery and classification
- **paperwork_compiler.py**: PDF compilation with A4 formatting
- **paperwork_data_loader.py**: Load job data for document generation
- **paperwork_slab_mapper_service.py**: Slab-to-piece mapping service

**Output:**
- Full paperwork PDF with all documents
- Install-only PDF for field use
- Consistent A4 portrait orientation

### **Tracing & Debugging**
The `core/tracing/` module provides application instrumentation:

- **tracer.py**: Core tracer implementation
- **events.py**: Event definitions and categorization
- **io_monitor.py**: I/O operation monitoring
- **storage.py**: Trace data persistence
- **report_generator.py**: Generate trace reports

## Technical Considerations

### **Performance Optimization**
- **Thumbnail Caching**: Automatic image processing with cache validation
- **Pagination**: Efficient loading of large job lists (18 jobs per page)
- **Background Processing**: Non-blocking operations for better UX
- **Memory Management**: Proper cleanup of resources and temporary files

### **Error Handling**
- **Graceful Degradation**: System continues operating if non-critical components fail
- **User-Friendly Messages**: Clear error reporting with actionable solutions
- **Logging Integration**: Comprehensive debug information for troubleshooting
- **Recovery Mechanisms**: Automatic recovery from common failure scenarios

### **Security & Deployment**
- **Network Compatibility**: Works in corporate/restricted environments
- **Offline Capability**: Bundled installers for air-gapped systems
- **User Isolation**: Personal data separation in multi-user environments
- **Configuration Validation**: Input sanitization and path validation
- **Dual Environment Support**: Code must function identically in both PyInstaller packaged executables (.exe) and Python virtual environment (.venv) development mode

## Common Tasks & Workflows

### **Script Development**
- AutoHotkey scripts are external and can be edited live
- Use `config/unified_scripts.json` to configure script-to-application mappings
- Test scripts using the launcher's integrated testing features
- AHK Manager provides a standalone control panel for script management

### **Job Management**
- Jobs are stored in SQLite database (`jobs.db`) with file-based `.ini` for active job
- Each job has associated directories: Programmer, Factory Paperwork, Templater
- Active job integration affects all tools and utilities
- Job extensions (remakes, fixups) create child records with dedicated folders
- Notion sync enables bidirectional job status tracking

### **Python Utilities**
- PDF Manager: Merge, split, organize PDF files
- DXF Converter: Format conversion and optimization
- Image Tools: Blending, manipulation, format conversion
- Calculators: Arc segments, mitre joins, specialized calculations
- Auto-Merge: Intelligent cutting sheet combination
- Paperwork Compiler: Automated job documentation assembly

### **Python Script Execution System**
**Script Locations**: Python utilities are stored in `/python_scripts/` directory and launched externally

**Launch Mechanism**: 
- Scripts are launched via `launch_python_script()` method in SharedApplicationState
- UI components call the shared state to execute scripts
- Message broker can trigger script execution from AHK scripts

**Python Executable Detection Priority**:
1. **Vendor Python** (highest priority): `/vendor/python/python.exe` - Portable Python installation
2. **Virtual Environment**: `/.venv/Scripts/python.exe` - Development environment
3. **System Python**: System-installed Python from PATH

**Vendor Directory**: `/vendor/python/` contains a complete portable Python installation used to execute external scripts independently of user system dependencies.

**Working Directory Context**: Scripts are launched with the active job's working directory as their CWD, allowing them to operate on job-specific files without path configuration.

### **Configuration Management**
- User settings override global defaults
- Machine-specific configurations in `config/unified_scripts.json`
- Directory path management with validation
- Preference persistence in user database

## Integration Points

### **External Software Integration**
- **CAD Software**: Direct hotkey integration with cutting optimization
- **CNC Machines**: Machine-specific automation scripts
- **File Formats**: DXF, PDF, PNG, TOP, VDF processing and conversion
- **Network Drives**: Shared storage and collaboration support
- **Notion API**: Bidirectional job sync and assignment tracking

### **Message Broker Communication**
- **MessageBroker**: Central TCP server coordinating all application components
- **AHK Bridge**: Enables AHK scripts to communicate with Python services via broker
- **Qt Client**: Thread-safe broker client for PySide6 GUI applications
- **Sync Client**: Blocking client for simple script integrations
- **Event Broadcasting**: Pub/sub model for state change notifications

### **Data Flow**
- Job data flows from creation → active tracking → completion → archive
- Configuration cascades from defaults → machine → user → job-specific
- Database provides persistent storage with in-memory caching
- Message broker coordinates state across all running components
- Notion sync maintains bidirectional data consistency

## Support & Troubleshooting

### **Common Issues**
- **Path Resolution**: Automatic detection of software installations
- **Network Deployment**: UNC path handling and permission management
- **User Permissions**: Directory creation and file access validation
- **Version Compatibility**: AutoHotkey and Python version management
- **Broker Connection**: Message broker connectivity and reconnection

### **Debug Information**
- Console version available for detailed logging
- Application tracing via `core/tracing/` module
- Configuration validation and path checking
- Process monitoring via launcher health checks
- Message broker logging for communication debugging

---

## AI Assistant Instructions

When helping with this system:

1. **Understand the Context**: This is a professional industrial automation system for stone fabrication
2. **Respect Architecture**: Maintain the modular design, shared state pattern, and separation of concerns
3. **Consider Users**: Balance technical capability with user-friendly operation
4. **Preserve Workflows**: Understand how changes affect the complete job lifecycle
5. **Maintain Performance**: Consider caching, pagination, and resource management
6. **Think Integration**: Changes often affect multiple components via message broker
7. **Plan for Scale**: Code should work for single users and network deployments
8. **Document Changes**: Maintain the comprehensive documentation standards
9. **Ensure Cross-Environment Compatibility**: ALL code must work in both PyInstaller packaged executables (.exe) and Python virtual environment (.venv) development mode
10. **Use Shared State**: For UI changes, work through SharedApplicationState rather than storing state in views

**Critical Development Rules**:
- Before implementing any code that accesses files, resources, or modules, ensure it handles both packaged and development environments
- Use resource path helpers that handle both `sys._MEIPASS` (packaged) and source directory (development) access
- For state changes, emit signals from SharedApplicationState so all views update reactively
- For inter-process communication, use the message broker client appropriate to your context (async, Qt, or sync)

This system represents years of development for real-world stone fabrication workflows. Approach modifications thoughtfully and consider the impact on daily operations and user productivity.
