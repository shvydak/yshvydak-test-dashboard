# @yshvydak/web

## 1.4.1

### Patch Changes

- bug fixes

## 1.4.0

### Minor Changes

-   - feat: test notes filter added to the tests page
    - Improved the Test Notes feature with a new filter option to display tests with notes, enhancing usability and documentation tracking.

## 1.3.2

### Patch Changes

- feat: Added show/hide password functionality with an eye icon to toggle password visibility.

## 1.3.1

### Patch Changes

- fix: logs attachments download and view
    - enhance attachment handling with new URL building functions and improved authentication flow

## 1.3.0

### Minor Changes

- Add test notes feature for annotating tests
    - Server: Add test_notes table, NoteController, NoteService, NoteRepository with REST API
    - Server: Integrate note cleanup with test deletion and Clear All Data
    - Core: Add TestNote interface and note API types
    - Web: Add TestNoteEditor component with edit/save/delete functionality
    - Web: Add LinkifiedText component for clickable URLs in notes
    - Web: Display notes in TestOverviewTab and add 💬 indicator to TestRow

## 1.2.0

### Minor Changes

- Flat view removed from the Tests page

## 1.1.0

### Minor Changes

- ee9f4d8: my GitHub repo link added
