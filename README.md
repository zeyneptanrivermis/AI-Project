# KNOCK — Design Your Door

## Project Description
   **KNOCK** is an interactive narrative and psychological interrogation experience. Idea manifests from Bob Dylan's song, Knocking on Heaven's Door and what if the door represents the inner self of the player?. 
   The player steps into the role of a wanted outlaw brought before their former friend, Sheriff Raymond Hayes. Through three distinct phases of questioning —Foundation, Reckoning, and Final Door—the player reflects on their past actions, guilt, and morality. The story dynamically adapts based on the honesty and vulnerability of the player's answers, directly impacting the "Pressure" in the room and Sheriff Hayes' emotional responses. Ultimately, the player's psychological profile is mapped to a unique, AI-generated "door" that symbolizes their inner self.

## Artistic Statement
> *"Knocking on Heaven's Door"* 
> — Bob Dylan, *Knockin' on Heaven's Door (1973)*

KNOCK is designed as a mirror instead of a trap. The experience is not about winning or choosing the "correct" dialogue options, but about confronting the weight of one's choices. Sheriff Hayes' questions are designed to be reflective, pushing the user to articulate their own identity and regrets. The system translates the player's truth and vulnerability into the atmosphere of the room (intensity/pressure) and culminates in a final visual reckoning and personalized psychological report. It is an exploration of interactive AI roleplay as a medium for emotional introspection.

## Tech Architecture Overview
**Backend Structure**
- `/routes/chat.py` — Dialogue endpoint, LLM integration
- `/services/claude_service.py` — Groq API wrapper, prompt engineering
- `/services/dalle_service.py` — Hugging Face FLUX.1 integration
- `/models.py` — Pydantic schemas (ChatRequest, StartRequest, etc.)

**Frontend Structure**
- `game.js` — Core game loop, state management, message handling
- `sprites.js` — Character animation controller
- `look.js` — Player head tracking (jury/judge focus)
- `style.css` — 1880s aesthetic, phase-based color transitions
- `index.html` — Scene layers, UI elements

**Data Flow**
User Input → Frontend → Backend LLM → JSON Response → State Update → UI/Audio/Scene Changes

## List of AI Techniques Used
- **Few-Shot Prompting**: Sheriff's questions were generated using few-shot prompting with the LLM. Example themes and related questions are given in system prompt. AI is asked to come up with personalized questions during the conversation based on the ongoing dialogue.
- **Dynamic State Management & Sentiment Analysis**: The LLM infers the user's emotional state (defensive, vulnerable, honest) to dynamically adjust the game's "Pressure" metric and the Sheriff's facial expressions (e.g., neutral, thoughtful, sad).
- **Natural Language Understanding (NLU)**: Throughout the conversation, the LLM actively extracts personality traits, recurring themes, and the emotional state of the player based *only* on the player's words.
- **Text-to-Image Generation (Generative Art)**: The player's psychological profile is dynamically injected into a cinematic prompt template to generate a personalized "Door" using a diffusion model (FLUX.1-schnell via Hugging Face Inference API), providing a customized visual resolution to the narrative.


## Dependencies & API Requirements
### Backend Dependencies
Ensure the following Python packages are installed (note: the `requirements.txt` might need to be updated with all these packages):
- `fastapi`
- `uvicorn`
- `python-dotenv`
- `pydantic`
- `groq`
- `httpx`

### API Requirements
You need the following API keys in your backend `.env` file:
- **`GROQ_API_KEY`**: Required for the text generation engine (Llama-3.1-8b-instant via Groq). You can get a free key at [console.groq.com](https://console.groq.com/).
- **`HF_API_TOKEN`**: Required for the text-to-image model (FLUX.1-schnell via Hugging Face Inference API).

## Installation & Setup Instructions
On your machine:
1. **Clone the repository** (if you haven't already).
2. **Setup the Backend**:
   ```bash
   cd hayes-protocol/backend
   python -m venv venv
   
   # Activate virtual environment
   # On Windows:
   venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   
   # Install dependencies
   pip install fastapi uvicorn python-dotenv pydantic groq httpx
   ```
3. **Configure Environment Variables**:
   Create a `.env` file in the `hayes-protocol/backend` directory and add your API keys:
   ```env
   GROQ_API_KEY=your_groq_api_key_here
   HF_API_TOKEN=your_huggingface_api_token_here
   ```
4. **Run the Backend Server**:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
5. **Run the Frontend**:
   Simply open `hayes-protocol/frontend/index.html` in your browser. 


## Features
- **Dynamic Interrogation**: LLM adapts questions based on player responses
- **Emotional Feedback**: Sheriff's expression changes (neutral/thoughtful/sad/happy/tired)
- **Pressure Mechanic**: Real-time intensity bar reflects room tension
- **Procedural Music**: Web Audio synthesis creates atmospheric "Knockin' on Heaven's Door" theme
- **Session Persistence**: Resume conversations via localStorage
- **Personalized Outcome**: AI-generated "door" image based on psychological profile
- **Transcript Log**: Full conversation history visible during play


## Example Outputs / Screenshots / Results

### Character Art / Atmosphere
<img src="hayes-protocol/frontend/assets/serif_normal.png" alt="Sheriff Hayes" width="200">
*Sheriff Raymond Hayes presides over the interrogation. His expression adapts dynamically to your answers.*

### Example Dialogue Flow
**Sheriff Hayes**: *"What's the first rule you've ever broken?"*
**Player**: *"I stole bread to feed my brother."*
**Sheriff Hayes**: *"Survival isn't always a crime... but it comes with a cost. Do you see their faces?"* 
*(Pressure decreases, Expression changes to: thoughtful)*

### The Final Door
At the end of the session, the system generates a case file and an AI-generated door image reflecting your psychological profile, interpreting traits such as: *"remorseful, brother's death, dusty road, Kansas, fire, loyalty over law, tired, seeking peace."*

## How to Play
1. **Select Character**: Choose your soldier archetype on start screen
2. **Answer Honestly**: Sheriff's questions mirror your decisions back at you
3. **Watch Pressure**: Intensity bar rises with evasion, falls with truth
4. **Read Signals**: Sheriff's expression reflects his emotional state
5. **Reach the Door**: Complete Phase 3 → Generate your personalized door image
6. **Download**: Save your psychological portrait as PNG

**Tips**: 
- Vulnerability lowers pressure faster than deflection
- Your words are tracked — consistency matters
- The door is a mirror, not a judgment


## Credits
- Concept & Design: Zeynep Tanrıvermiş, Defne Demir
- LLM Integration: Groq (Llama-3.1-8b-instant)
- Image Generation: Hugging Face (FLUX.1-schnell)
- Web Audio: Native Web Audio API + Karplus-Strong synthesis
- Fonts: Special Elite (serif), Courier Prime (monospace)