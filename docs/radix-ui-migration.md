# Custom Component to Radix UI Migration Plan

This document outlines a plan to migrate our custom-built components to their Radix UI equivalents. The goal of this migration is to unify the developer experience, reduce maintenance overhead, and leverage the accessibility and composability of Radix UI.

## Custom Component Analysis

Below is a list of our custom components and their potential Radix UI replacements.

### 1. `src/components/ChatBubble.tsx`

**Analysis:**

The `ChatBubble` component is a presentational component that wraps the `ReactMarkdown` library to render chat messages. It applies different styles based on whether the message is from a user or the model.

**Recommendation:**

No direct Radix UI replacement is needed for this component. The existing implementation is sufficient, as it primarily handles styling and markdown rendering. We can continue to use a `div` element with our custom styles.

### 2. `src/components/ChatInputControls.tsx`

**Analysis:**

The `ChatInputControls` component is a feature-rich component that manages user input, message sending, and various search toggles. It also includes a file upload trigger. The component already uses our custom `Button`, `Input`, and `Tooltip` components.

**Recommendation:**

The primary improvement would be to replace the custom `Button` and `Input` components with their official Radix UI equivalents. This would involve updating the imports from `@/components/ui/button` and `@/components/ui/input` to the corresponding Radix UI packages. The `Tooltip` component is already being used.

### 3. `src/components/ChatMessageContent.tsx`

**Analysis:**

The `ChatMessageContent` component is a specialized component that handles the rendering of chat messages, including markdown and custom citations. It uses the `ReactMarkdown` library and contains custom logic for normalizing text and handling citations.

**Recommendation:**

No Radix UI replacement is recommended for this component. Its functionality is highly specific to our application, and the existing implementation is the best fit.

### 4. `src/components/CitationPreviewSidebar.tsx`

**Analysis:**

The `CitationPreviewSidebar` component is a specialized component that displays a preview of a citation in a sidebar. It uses the `Sheet` component from our UI library, which is built on top of Radix UI's `Dialog` component. It also uses the `react-pdf` library to render PDF documents.

**Recommendation:**

No Radix UI replacement is recommended for this component. Its functionality is highly specific to our application, and it already leverages a Radix-based `Sheet` component. The PDF rendering is handled by `react-pdf`, which is the correct tool for the job.

### 5. `src/components/PdfWorkerSetup.tsx`

**Analysis:**

The `PdfWorkerSetup` component is a configuration file responsible for setting up the PDF.js worker. This is a critical part of our PDF viewing functionality, but it is not a UI component and has no visual output.

**Recommendation:**

No Radix UI replacement is needed for this component. It is a necessary configuration file for `react-pdf` and should be maintained as is.

### 6. `src/components/theme-provider.tsx`

**Analysis:**

The `ThemeProvider` component is a wrapper around the `NextThemesProvider` from the `next-themes` library. It is responsible for providing theme-related context to the application, enabling features like dark mode.

**Recommendation:**

No Radix UI replacement is needed for this component. Radix UI is unstyled and does not provide a theme provider. The current implementation using `next-themes` is the correct approach for handling theming in a Next.js application.

### 7. `src/components/theme-toggle-button.tsx`

**Analysis:**

The `ThemeToggleButton` component is a button that allows users to toggle between light and dark themes. It uses the `useTheme` hook from the `next-themes` library to manage the theme state and our custom `Button` component for the UI.

**Recommendation:**

No Radix UI replacement is needed for this component. The component already uses a `Button` from our UI library, which is likely built on top of Radix UI. The core theme-switching functionality is correctly handled by the `next-themes` library.

### 8. `src/components/chat` Directory

**Analysis:**

The components in the `src/components/chat` directory are all highly specialized and tailored to the specific needs of our chat application. They handle features such as chat configuration, message history, input controls, file uploads, and server status.

**Recommendation:**

No Radix UI replacements are recommended for the components in this directory. They are all custom components that are essential for the functionality of our application.

### 9. `src/components/markdown` Directory

**Analysis:**

The components in the `src/components/markdown` directory are all highly specialized and tailored to the specific needs of our application. They handle the rendering of markdown content, including Mermaid diagrams and custom styling.

**Recommendation:**

No Radix UI replacements are recommended for the components in this directory. They are all custom components that are essential for the functionality of our application.
