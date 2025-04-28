# **App Name**: LambdaChat

## Core Features:

- Chat UI: Elegant chat interface with clear message bubbles and smooth scrolling.
- Endpoint Configuration: Configuration panel for selecting LLM and RAG endpoint. The panel must display a list of available services/models to connect to.
- RAG Integration: The application must use the Bedrock endpoint to provide the selected LLM with the context from the selected RAG service, acting as a tool, to generate better responses.

## Style Guidelines:

- Modern and clean layout with a focus on readability and user experience. Use HeroUI components for a consistent design.
- Dark mode with a sliding color scheme to match the selected LLM or RAG endpoint. The color scheme should transition smoothly.
- Accent color: Use a vibrant teal (#008080) to highlight interactive elements and create visual interest.
- Clean and modern typography for readability.
- Use clear and consistent icons from HeroUI for actions and status indicators.
- Subtle animations for transitions and feedback to enhance the user experience.

## Original User Request:
Front-end for a RAG application. Uses React and HeroUI components library. Has darkmode with sliding color scheme to match. Has a selector for LLMs and RAG endpoints (there will be multiple applications that I want to test through the same ui). Has a modern elegant chat app design and feel. The applications will be exposed through AWS Lambda and model selection happens through AWS Bedrock endpoints
  