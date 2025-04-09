# Few-Shot Chatbot

Web app for controlling AI responses through examples instead of instructions.

## Core Features

- **Examples**: Input-output pairs that guide response patterns
- **Templates**: Customizable input fields with editable descriptions
- **Conversation**: Chat interface using examples and templates

## Updates

- Templates: Added resizable cards, multi-field support, editable descriptions
- Storage: Auto-saves to localStorage
- Context: Combines examples and templates in Gemini API prompts

Uses Gemini API with few-shot prompting technique to create consistent outputs based on demonstrated patterns. 