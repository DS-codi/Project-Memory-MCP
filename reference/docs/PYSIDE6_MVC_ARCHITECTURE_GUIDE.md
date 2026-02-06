# PySide6 MVC Architecture Guide

A comprehensive guide to building Python desktop applications using PySide6 (Qt6) with a strict MVC (Model-View-Controller) architecture where all UI is defined by `.ui` files, never programmatically created.

This guide is based on the patterns used in **ds_pas** (Direct Stone Programming Automation Suite).

---

## Table of Contents

1. [Project Structure](#project-structure)
2. [Core Concepts](#core-concepts)
3. [Setting Up a New Project](#setting-up-a-new-project)
4. [Models](#models)
5. [Views](#views)
6. [Controllers](#controllers)
7. [Signal Registry (Event System)](#signal-registry)
8. [Services](#services)
9. [Application Bootstrap (DI Container)](#application-bootstrap)
10. [Working with .ui Files](#working-with-ui-files)
11. [Best Practices](#best-practices)
12. [Quick Reference](#quick-reference)

---

## Project Structure

```
my_app/
├── app.py                     # Application bootstrap & DI container
├── __init__.py
├── __main__.py                # Entry point
├── controllers/               # Business logic & coordination
│   ├── __init__.py
│   ├── base.py               # BaseController abstract class
│   ├── app_controller.py     # Main application controller
│   ├── job_controller.py     # Domain-specific controller
│   └── settings_controller.py
├── models/                    # Data structures & state
│   ├── __init__.py
│   ├── base.py               # BaseModel with Qt signals
│   ├── job.py                # Domain model
│   ├── settings.py           # Settings model
│   └── state.py              # Application state singleton
├── views/                     # UI components (load from .ui files)
│   ├── __init__.py
│   ├── base.py               # BaseView abstract class
│   ├── main_window.py        # Main window view
│   ├── dialogs/              # Dialog views
│   ├── panels/               # Panel views
│   └── widgets/              # Reusable widget views
├── services/                  # External interactions
│   ├── __init__.py
│   ├── database/             # Database repositories
│   ├── file_service.py       # File operations
│   └── broker_client.py      # Message broker integration
├── resources/                 # Static resources
│   ├── __init__.py
│   ├── ui/                   # .ui files (Qt Designer)
│   │   ├── main_window.ui
│   │   ├── dialogs/
│   │   ├── panels/
│   │   └── widgets/
│   └── icons/                # Application icons
├── utils/                     # Utilities
│   ├── __init__.py
│   ├── signals.py            # Central signal registry
│   ├── paths.py              # Path utilities
│   └── types.py              # Type definitions
└── tests/                     # Test suite
```

---

## Core Concepts

### MVC Separation of Concerns

| Component      | Responsibility                                    | Does NOT                                |
|----------------|---------------------------------------------------|----------------------------------------|
| **Model**      | Data structures, validation, serialization        | Touch UI, call services directly       |
| **View**       | Render UI from .ui files, capture user input      | Contain business logic, modify data    |
| **Controller** | Coordinate models & services, handle actions      | Manipulate UI elements directly        |

### Key Principles

1. **UI files only**: All UI is defined in `.ui` files via Qt Designer
2. **Signal-driven updates**: Views subscribe to signals; controllers emit signals
3. **No direct UI manipulation**: Controllers never touch UI widgets
4. **Dependency injection**: Services are injected, not instantiated directly
5. **Single signal registry**: One central place for all application signals

---

## Setting Up a New Project

### 1. Install Dependencies

```bash
pip install PySide6
```

### 2. Project Requirements

```txt
# requirements.txt
PySide6>=6.5.0
```

### 3. Create Entry Point

```python
# __main__.py
"""Application entry point."""
import sys
from my_app.app import MyApplication

def main():
    app = MyApplication()
    return app.run()

if __name__ == "__main__":
    sys.exit(main())
```

---

## Models

### Base Model Pattern

All models inherit from `BaseModel` which provides:
- Qt signal support for property change notifications
- Serialization/deserialization (`to_dict()` / `from_dict()`)
- Consistent interface across all models

```python
# models/base.py
"""Base model class with Qt signal support."""

from datetime import datetime
from typing import Any, TypeVar, Type
from PySide6.QtCore import QObject, Signal

T = TypeVar('T', bound='BaseModel')


class BaseModel(QObject):
    """
    Base class for all domain models.
    
    Provides:
    - Qt signal support for reactive UI updates
    - Serialization via to_dict() / from_dict()
    - Property change notifications
    """
    
    # Emitted when any property changes: (property_name, new_value)
    property_changed = Signal(str, object)
    
    # Emitted when the model is modified in any way
    changed = Signal()
    
    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._created_at: datetime = datetime.now()
        self._updated_at: datetime = datetime.now()
    
    @property
    def created_at(self) -> datetime:
        return self._created_at
    
    @property
    def updated_at(self) -> datetime:
        return self._updated_at
    
    def _set_property(self, name: str, old_value: Any, new_value: Any) -> bool:
        """Set a property and emit signals if changed."""
        if old_value != new_value:
            self._updated_at = datetime.now()
            self.property_changed.emit(name, new_value)
            self.changed.emit()
            return True
        return False
    
    def to_dict(self) -> dict[str, Any]:
        """Serialize the model to a dictionary."""
        return {
            "created_at": self._created_at.isoformat(),
            "updated_at": self._updated_at.isoformat(),
        }
    
    @classmethod
    def from_dict(cls: Type[T], data: dict[str, Any]) -> T:
        """Deserialize a model from a dictionary."""
        instance = cls()
        if "created_at" in data:
            instance._created_at = datetime.fromisoformat(data["created_at"])
        if "updated_at" in data:
            instance._updated_at = datetime.fromisoformat(data["updated_at"])
        return instance
```

### Example Domain Model

```python
# models/job.py
"""Job domain model."""

from enum import Enum
from typing import Any
from ds_pas.models.base import BaseModel


class JobStatus(Enum):
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"


class Job(BaseModel):
    """Represents a job in the system."""
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self._id: str = ""
        self._job_number: str = ""
        self._customer_name: str = ""
        self._status: JobStatus = JobStatus.PENDING
    
    @property
    def id(self) -> str:
        return self._id
    
    @id.setter
    def id(self, value: str) -> None:
        if self._set_property("id", self._id, value):
            self._id = value
    
    @property
    def job_number(self) -> str:
        return self._job_number
    
    @job_number.setter
    def job_number(self, value: str) -> None:
        if self._set_property("job_number", self._job_number, value):
            self._job_number = value
    
    @property
    def status(self) -> JobStatus:
        return self._status
    
    @status.setter
    def status(self, value: JobStatus) -> None:
        if self._set_property("status", self._status, value):
            self._status = value
    
    def to_dict(self) -> dict[str, Any]:
        data = super().to_dict()
        data.update({
            "id": self._id,
            "job_number": self._job_number,
            "customer_name": self._customer_name,
            "status": self._status.value,
        })
        return data
    
    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Job":
        job = super().from_dict(data)
        job._id = data.get("id", "")
        job._job_number = data.get("job_number", "")
        job._customer_name = data.get("customer_name", "")
        job._status = JobStatus(data.get("status", "pending"))
        return job
```

---

## Views

### Base View Pattern

Views load UI from `.ui` files and delegate actions to controllers.

```python
# views/base.py
"""Base View Protocol and Abstract Classes."""

from typing import Protocol, Optional, Any, TYPE_CHECKING
from PySide6.QtWidgets import QWidget
from PySide6.QtCore import Signal

if TYPE_CHECKING:
    from my_app.controllers.base import BaseController


class IView(Protocol):
    """Protocol defining the view interface."""
    
    def set_controller(self, controller: 'BaseController') -> None:
        """Bind a controller to this view."""
        ...
    
    def refresh(self) -> None:
        """Refresh the view from current model state."""
        ...


class BaseView(QWidget):
    """
    Abstract base class for all views.
    
    Subclasses must implement:
    - _init_ui(): Load UI from .ui file
    - refresh(): Update display from model state
    """
    
    # Common signals
    error_occurred = Signal(str, str)  # title, message
    action_requested = Signal(str, dict)  # action_name, params
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._controller: Optional['BaseController'] = None
        
        self._init_ui()
        self._connect_signals()
    
    def _init_ui(self) -> None:
        """Initialize the UI by loading from .ui file. Override in subclass."""
        pass
    
    def _connect_signals(self) -> None:
        """Connect internal signals. Override in subclass."""
        pass
    
    def set_controller(self, controller: 'BaseController') -> None:
        """Bind a controller to this view."""
        self._controller = controller
    
    def refresh(self) -> None:
        """Refresh the view. Override in subclass."""
        pass
```

### Loading UI Files with QUiLoader

```python
# views/widgets/my_widget.py
"""Example widget that loads from .ui file."""

from pathlib import Path
from typing import Optional

from PySide6.QtWidgets import QWidget, QLabel, QPushButton, QVBoxLayout
from PySide6.QtCore import Signal, QFile
from PySide6.QtUiTools import QUiLoader


class MyWidget(QWidget):
    """
    Widget that loads its UI from a .ui file.
    
    UI File: resources/ui/widgets/my_widget.ui
    """
    
    # Signals for controller communication
    button_clicked = Signal(str)  # button_id
    
    def __init__(self, parent: Optional[QWidget] = None):
        super().__init__(parent)
        self._init_ui()
        self._connect_signals()
    
    def _init_ui(self) -> None:
        """Load UI from .ui file and bind widget references."""
        # Calculate path to .ui file
        ui_path = Path(__file__).parent.parent.parent / "resources" / "ui" / "widgets" / "my_widget.ui"
        
        loader = QUiLoader()
        ui_file = QFile(str(ui_path))
        
        if ui_file.open(QFile.ReadOnly):
            self._ui = loader.load(ui_file, self)
            ui_file.close()
            
            # Set up layout to contain loaded UI
            layout = QVBoxLayout(self)
            layout.setContentsMargins(0, 0, 0, 0)
            layout.addWidget(self._ui)
            
            # Bind widget references using findChild
            self._title_label: QLabel = self._ui.findChild(QLabel, "title_label")
            self._action_btn: QPushButton = self._ui.findChild(QPushButton, "action_btn")
        else:
            # Fallback: create minimal UI if .ui file not found
            self._create_fallback_ui()
    
    def _create_fallback_ui(self) -> None:
        """Create fallback UI if .ui file is not available."""
        layout = QVBoxLayout(self)
        self._title_label = QLabel("Title")
        self._action_btn = QPushButton("Action")
        layout.addWidget(self._title_label)
        layout.addWidget(self._action_btn)
    
    def _connect_signals(self) -> None:
        """Connect UI signals to handlers."""
        if self._action_btn:
            self._action_btn.clicked.connect(
                lambda: self.button_clicked.emit("action")
            )
    
    # Public methods for controller to update the view
    def set_title(self, title: str) -> None:
        """Update the title label."""
        if self._title_label:
            self._title_label.setText(title)
    
    def set_button_enabled(self, enabled: bool) -> None:
        """Enable/disable the action button."""
        if self._action_btn:
            self._action_btn.setEnabled(enabled)
```

---

## Controllers

### Base Controller Pattern

Controllers handle user actions and coordinate between models and services.

```python
# controllers/base.py
"""Base controller class."""

from typing import Any, Protocol
from abc import ABC

from PySide6.QtCore import QObject

from my_app.utils.signals import SignalRegistry


class IView(Protocol):
    """Protocol for views that can bind to controllers."""
    
    def set_controller(self, controller: "BaseController") -> None:
        ...
    
    def refresh(self) -> None:
        ...


class BaseController(QObject):
    """
    Base class for all controllers.
    
    Controllers should:
    - Implement initialize() for setup logic
    - Implement cleanup() for teardown logic
    - Use signals for updates, not direct view calls
    
    Controllers should NOT:
    - Directly manipulate UI elements
    - Perform database queries (use repositories/services)
    - Make network calls (use services)
    """
    
    def __init__(
        self,
        signals: SignalRegistry,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(parent)
        self._signals = signals
        self._views: list[IView] = []
        self._initialized = False
    
    @property
    def signals(self) -> SignalRegistry:
        return self._signals
    
    def register_view(self, view: IView) -> None:
        """Register a view with this controller."""
        if view not in self._views:
            self._views.append(view)
            view.set_controller(self)
    
    def unregister_view(self, view: IView) -> None:
        """Unregister a view from this controller."""
        if view in self._views:
            self._views.remove(view)
    
    def notify_views(self, data: dict[str, Any] | None = None) -> None:
        """Notify all registered views to refresh."""
        for view in self._views:
            view.refresh()
    
    def initialize(self) -> None:
        """Initialize the controller. Override in subclass."""
        self._initialized = True
    
    def cleanup(self) -> None:
        """Clean up the controller. Override in subclass."""
        self._views.clear()
```

### Example Domain Controller

```python
# controllers/job_controller.py
"""Job controller handling all job-related operations."""

import logging
from typing import Optional

from PySide6.QtCore import QObject

from my_app.controllers.base import BaseController
from my_app.utils.signals import SignalRegistry
from my_app.models.job import Job, JobStatus
from my_app.services.database.jobs_repository import JobsRepository

logger = logging.getLogger(__name__)


class JobController(BaseController):
    """
    Controller for job operations.
    
    Methods:
        activate_job(job_id) - Activate a job
        create_job(data) - Create a new job
        update_job(job_id, updates) - Update job data
        get_job(job_id) - Retrieve a job
    """
    
    def __init__(
        self,
        signals: SignalRegistry,
        jobs_repository: JobsRepository,
        parent: QObject | None = None,
    ) -> None:
        super().__init__(signals, parent)
        self._repository = jobs_repository
        self._active_job: Optional[Job] = None
    
    def initialize(self) -> None:
        super().initialize()
        logger.info("JobController initialized")
    
    def activate_job(self, job_id: str) -> bool:
        """
        Activate a job.
        
        1. Retrieve job from repository
        2. Update internal state
        3. Emit signal for UI updates
        """
        job = self._repository.get_job(job_id)
        if job is None:
            logger.error(f"Job not found: {job_id}")
            self._signals.error_occurred.emit("Job Not Found", f"ID: {job_id}")
            return False
        
        self._active_job = job
        
        # Emit signal - views will update themselves
        self._signals.job_changed.emit(job_id)
        
        logger.info(f"Activated job: {job.job_number}")
        return True
    
    def create_job(self, job_number: str, customer_name: str) -> Optional[Job]:
        """Create a new job."""
        job = Job()
        job.job_number = job_number
        job.customer_name = customer_name
        job.status = JobStatus.PENDING
        
        saved_job = self._repository.create_job(job)
        if saved_job:
            self._signals.job_created.emit(saved_job.id)
            logger.info(f"Created job: {job_number}")
        
        return saved_job
    
    @property
    def active_job(self) -> Optional[Job]:
        """Get the currently active job."""
        return self._active_job
```

---

## Signal Registry

A central registry for all application signals, providing a single source of truth for event-driven communication.

```python
# utils/signals.py
"""Central signal definitions."""

from PySide6.QtCore import QObject, Signal


class SignalRegistry(QObject):
    """
    Central registry for all application signals.
    
    Benefits:
    - Track all signals in the application
    - Connect/disconnect handlers easily
    - Debug signal flow
    
    Usage:
        signals = SignalRegistry()
        signals.job_changed.connect(my_handler)
        signals.job_changed.emit("1234567")
    """
    
    # =========================================================================
    # Job Signals
    # =========================================================================
    
    # Emitted when the active job changes
    job_changed = Signal(str)  # job_id
    
    # Emitted when a new job is created
    job_created = Signal(str)  # job_id
    
    # Emitted when job data is modified
    job_updated = Signal(str, str)  # job_id, field
    
    # Emitted when a job is deleted
    job_deleted = Signal(str)  # job_id
    
    # =========================================================================
    # Settings Signals
    # =========================================================================
    
    # Emitted when any setting is modified
    settings_changed = Signal(str, object)  # key, value
    
    # =========================================================================
    # Connection Signals
    # =========================================================================
    
    # Emitted when broker connection state changes
    broker_status_changed = Signal(bool)  # connected
    
    # =========================================================================
    # UI Signals
    # =========================================================================
    
    # Emitted when theme changes
    theme_changed = Signal(str)  # "light" or "dark"
    
    # Emitted when app is closing
    app_closing = Signal()
    
    # =========================================================================
    # Error Signals
    # =========================================================================
    
    # Emitted when an error should be displayed
    error_occurred = Signal(str, str)  # title, message
    
    # Emitted for warnings
    warning_occurred = Signal(str, str)  # title, message
    
    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
    
    # Convenience methods
    def emit_job_changed(self, job_id: str) -> None:
        self.job_changed.emit(job_id)
    
    def emit_error(self, title: str, message: str) -> None:
        self.error_occurred.emit(title, message)


# Singleton instance
_signal_registry: SignalRegistry | None = None


def get_signal_registry() -> SignalRegistry:
    """Get or create the global signal registry."""
    global _signal_registry
    if _signal_registry is None:
        _signal_registry = SignalRegistry()
    return _signal_registry
```

---

## Services

Services handle external interactions (database, files, network). They are injected into controllers.

```python
# services/database/jobs_repository.py
"""Jobs database repository."""

from typing import Optional, List
from my_app.models.job import Job


class JobsRepository:
    """
    Repository for job data persistence.
    
    Abstracts database operations from controllers.
    """
    
    def __init__(self, db_path: str):
        self._db_path = db_path
        # Initialize database connection
    
    def get_job(self, job_id: str) -> Optional[Job]:
        """Retrieve a job by ID."""
        # Database query
        pass
    
    def create_job(self, job: Job) -> Optional[Job]:
        """Create a new job."""
        # Database insert
        pass
    
    def update_job(self, job: Job) -> bool:
        """Update an existing job."""
        # Database update
        pass
    
    def delete_job(self, job_id: str) -> bool:
        """Delete a job."""
        # Database delete
        pass
    
    def list_jobs(self, limit: int = 100) -> List[Job]:
        """List all jobs."""
        # Database query
        pass
```

---

## Application Bootstrap

The application class serves as the DI container and orchestrates startup.

```python
# app.py
"""Application bootstrap and DI container."""

import sys
import logging
from typing import Any
from pathlib import Path

from PySide6.QtWidgets import QApplication
from PySide6.QtCore import QObject

from my_app.utils.signals import SignalRegistry, get_signal_registry
from my_app.controllers.app_controller import AppController
from my_app.controllers.job_controller import JobController
from my_app.services.database.jobs_repository import JobsRepository
from my_app.views.main_window import MainWindowView

logger = logging.getLogger(__name__)


class MyApplication:
    """
    Singleton application with DI container.
    
    Responsible for:
    - Creating Qt application
    - Registering services
    - Registering controllers
    - Managing lifecycle
    """
    
    _instance: "MyApplication | None" = None
    
    def __new__(cls) -> "MyApplication":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self) -> None:
        if self._initialized:
            return
        
        self._initialized = True
        self._qt_app: QApplication | None = None
        self._services: dict[str, Any] = {}
        self._controllers: dict[str, Any] = {}
        self._main_window: QObject | None = None
        self._signals = get_signal_registry()
        
        self._setup_logging()
    
    def _setup_logging(self) -> None:
        """Configure logging."""
        logging.basicConfig(
            level=logging.DEBUG,
            format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        )
        logger.info("Application starting...")
    
    def _create_qt_app(self) -> QApplication:
        """Create Qt application."""
        app = QApplication(sys.argv)
        app.setApplicationName("My Application")
        app.setApplicationVersion("1.0.0")
        return app
    
    def _register_services(self) -> None:
        """Register all services."""
        self._services["jobs_repository"] = JobsRepository("data/jobs.db")
    
    def _register_controllers(self) -> None:
        """Register all controllers."""
        self._controllers["job"] = JobController(
            signals=self._signals,
            jobs_repository=self._services["jobs_repository"],
        )
        
        # Initialize all controllers
        for controller in self._controllers.values():
            controller.initialize()
    
    def _create_main_window(self) -> MainWindowView:
        """Create and configure main window."""
        window = MainWindowView(
            signals=self._signals,
            job_controller=self._controllers["job"],
        )
        return window
    
    def run(self) -> int:
        """Run the application."""
        self._qt_app = self._create_qt_app()
        
        self._register_services()
        self._register_controllers()
        
        self._main_window = self._create_main_window()
        self._main_window.show()
        
        return self._qt_app.exec()
    
    def shutdown(self) -> None:
        """Clean shutdown."""
        self._signals.app_closing.emit()
        
        for controller in self._controllers.values():
            controller.cleanup()
        
        logger.info("Application shutdown complete")
```

---

## Working with .ui Files

### Creating .ui Files with Qt Designer

1. **Launch Qt Designer**:
   ```bash
   pyside6-designer
   ```

2. **Create a new form** (Widget, MainWindow, or Dialog)

3. **Design your UI** using the drag-and-drop interface

4. **Name your widgets** - Critical! Use the Object Name property to give widgets meaningful names like:
   - `title_label`
   - `action_btn`
   - `job_list`

5. **Save** to `resources/ui/` directory

### Loading .ui Files at Runtime

```python
from pathlib import Path
from PySide6.QtWidgets import QWidget, QVBoxLayout
from PySide6.QtCore import QFile
from PySide6.QtUiTools import QUiLoader


class MyView(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self._load_ui()
    
    def _load_ui(self) -> None:
        # Path to .ui file relative to this module
        ui_path = Path(__file__).parent.parent / "resources" / "ui" / "my_view.ui"
        
        loader = QUiLoader()
        ui_file = QFile(str(ui_path))
        
        if not ui_file.open(QFile.ReadOnly):
            raise FileNotFoundError(f"Cannot open UI file: {ui_path}")
        
        # Load the UI
        self._ui = loader.load(ui_file, self)
        ui_file.close()
        
        # Add loaded UI to this widget's layout
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self._ui)
        
        # Bind widget references by their object names
        self._title_label = self._ui.findChild(QLabel, "title_label")
        self._action_btn = self._ui.findChild(QPushButton, "action_btn")
```

### Widget Naming Conventions in .ui Files

| Widget Type  | Naming Pattern        | Example              |
|-------------|----------------------|----------------------|
| Label       | `*_label`            | `job_number_label`   |
| Button      | `*_btn`              | `save_btn`           |
| Line Edit   | `*_input` or `*_edit`| `customer_input`     |
| List        | `*_list`             | `jobs_list`          |
| Table       | `*_table`            | `pieces_table`       |
| Combo       | `*_combo`            | `status_combo`       |
| Container   | `*_container`        | `main_container`     |
| Frame       | `*_frame`            | `header_frame`       |

---

## Best Practices

### 1. Never Create UI Programmatically

❌ **Wrong**:
```python
def _init_ui(self):
    layout = QVBoxLayout(self)
    self.btn = QPushButton("Click Me")
    layout.addWidget(self.btn)
```

✅ **Correct**:
```python
def _init_ui(self):
    # Load from .ui file
    self._ui = self._load_ui_file("my_widget.ui")
    self.btn = self._ui.findChild(QPushButton, "action_btn")
```

### 2. Controllers Never Touch UI

❌ **Wrong**:
```python
class JobController(BaseController):
    def activate_job(self, job_id):
        # DON'T DO THIS
        self._view.job_label.setText(job.name)
```

✅ **Correct**:
```python
class JobController(BaseController):
    def activate_job(self, job_id):
        # Emit signal - views subscribe and update themselves
        self._signals.job_changed.emit(job_id)
```

### 3. Views Subscribe to Signals

```python
class JobPanel(BaseView):
    def _connect_signals(self):
        # Subscribe to signals
        self._signals.job_changed.connect(self._on_job_changed)
    
    def _on_job_changed(self, job_id: str):
        # Update UI based on new state
        self.refresh()
```

### 4. Use Service Locator for Cross-Cutting Services

```python
# utils/types.py
class ServiceLocator:
    _services: dict[str, Any] = {}
    
    @classmethod
    def register(cls, name: str, service: Any) -> None:
        cls._services[name] = service
    
    @classmethod
    def get(cls, name: str) -> Any:
        return cls._services.get(name)
```

### 5. Always Provide Fallback UI

```python
def _init_ui(self):
    try:
        self._load_ui_from_file()
    except FileNotFoundError:
        self._create_fallback_ui()
```

---

## Quick Reference

### Signal Flow

```
User Action (View)
       ↓
    View Signal
       ↓
    Controller (handles action)
       ↓
    Service (external operation)
       ↓
    SignalRegistry.emit()
       ↓
    Views refresh()
```

### File Locations

| Component      | Location                    |
|---------------|----------------------------|
| .ui files     | `resources/ui/`            |
| Controllers   | `controllers/`             |
| Models        | `models/`                  |
| Views         | `views/`                   |
| Services      | `services/`                |
| Signals       | `utils/signals.py`         |

### Common Imports

```python
# Qt
from PySide6.QtWidgets import QWidget, QMainWindow, QDialog
from PySide6.QtCore import Signal, Slot, QFile
from PySide6.QtUiTools import QUiLoader

# Project
from my_app.utils.signals import SignalRegistry, get_signal_registry
from my_app.controllers.base import BaseController
from my_app.views.base import BaseView
from my_app.models.base import BaseModel
```

---

## See Also

- [MESSAGE_BROKER_GUIDE.md](./MESSAGE_BROKER_GUIDE.md) - Inter-process communication between Python apps and AHK
- [Qt Designer Documentation](https://doc.qt.io/qt-6/qtdesigner-manual.html)
- [PySide6 Documentation](https://doc.qt.io/qtforpython-6/)
