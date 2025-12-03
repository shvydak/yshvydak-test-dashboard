# @yshvydak/core

## 1.3.0

### Minor Changes

- Add test notes feature for annotating tests
    - Server: Add test_notes table, NoteController, NoteService, NoteRepository with REST API
    - Server: Integrate note cleanup with test deletion and Clear All Data
    - Core: Add TestNote interface and note API types
    - Web: Add TestNoteEditor component with edit/save/delete functionality
    - Web: Add LinkifiedText component for clickable URLs in notes
    - Web: Display notes in TestOverviewTab and add 💬 indicator to TestRow
