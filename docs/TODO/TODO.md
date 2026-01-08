# Development TODO

## Known Issues

### Active Issues

@vibe у меня есть фича test notes. На данный момент я могу вставлять туда только текст. Я хо чу иметь возможность вставлять/добавлять так-же картинки (скриншоты, фото и т.п.). Я хочу чтобы чтобы рядом с текстом отображался маленькие thumbnails, на которые можно нвжать и откроется картинка в свой полный размер. Тебе понятно или есть вопросы или предложения?

- `[x]` StdOut testResult.stdout (https://695a6d88b07f3212db9f2575--probuild-all-tests.netlify.app/#?testId=214f47d38335a797643d-408704fc7590f31148f7)
- `[ ]` Search by test note
- `[ ]` Show annotation/descriptions in a test
- `[ ]` Clear package.json scripts
- `[ ]` Implement multiprojects supporting
- `[ ]` Merge dashboard to the playwright project?

### Completed Issues ✅

### Draft:

```
 I want to extend the existing Test Notes feature with image support.

Current state:
• Test notes support text only.

Goal:
• Allow users to add images (screenshots, photos) directly into test notes along with text.

Functional requirements: 1. Images can be added only via:
• Drag & drop of one or multiple image files directly into the text input.
• Paste from clipboard (e.g. pasted screenshots). 2. No separate upload button should be introduced. 3. Images should be inserted at the cursor position and displayed together with text, preserving order. 4. Images must be rendered as small thumbnails. 5. Each thumbnail must be clickable. 6. On click, the image opens in full size (modal / lightbox / overlay).

UX requirements:
• Dragging images over the text field should provide clear visual feedback.
• Thumbnails should be compact and not disrupt text readability.
• Full-size preview should be easy to close.
• Multiple images per note must be supported.

Constraints:
• Keep the solution simple and consistent with existing patterns.
• Reuse existing components/utilities where possible.
• Avoid overengineering.

Assume full knowledge of the current architecture and codebase.

This is a new feature, not a refactor or review.
```
