# 🦕 Papersaurus - AI-Powered Greeting Card Generator

![Papersaurus](https://papersaurus.com/logo.png)

## 📝 Overview

Papersaurus is a modern web application that uses AI to generate personalized greeting cards. Simply provide details about your recipient and occasion, and our AI creates unique, beautiful card designs with custom messages.

### ✨ Key Features

- **AI-Generated Designs**: Create unique card artwork using advanced AI models
- **Personalized Messages**: Generate heartfelt, funny, or professional messages tailored to your recipient
- **Multiple Card Types**: Birthday, Anniversary, Thank You, Holiday, Sympathy, and more
- **Reference Photos**: Upload photos to include people or pets in your card designs
- **Print & Digital**: Get physical cards printed or download PDFs
- **QR Code Sharing**: Each card includes a QR code for easy digital sharing
- **Mobile-First Design**: Optimized for creating cards on your phone

## 🚀 Live Demo

Visit [https://papersaurus.com](https://papersaurus.com) to try it out!

## 🛠️ Technology Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Socket.IO Client**: Real-time card generation updates
- **Framer Motion**: Smooth animations

### Backend
- **Flask**: Python web framework
- **Socket.IO**: WebSocket communication
- **SendGrid**: Email delivery
- **MCP (Model Control Protocol)**: AI model orchestration
- **SQLite**: Lightweight database

### AI Models
- **Gemini 2.5 Pro**: Message generation and photo analysis
- **GPT-1 Image Model**: Card artwork generation
- **Vision AI**: Reference photo analysis

## 📦 Installation

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+
- Git

### Clone Repository
```bash
git clone https://github.com/JordanJGilbert/Papersaurus.git
cd Papersaurus
```

### Frontend Setup
```bash
cd ast_chat
npm install
npm run dev
```

### Backend Setup
```bash
# Install Python dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your API keys:
# - OPENAI_API_KEY
# - ANTHROPIC_API_KEY
# - SENDGRID_API_KEY

# Run Flask server
python app.py
```

### MCP Service Setup
```bash
cd mcp_client
python mcp_service.py
```

## 🔧 Environment Variables

Create a `.env` file with the following:

```env
# AI API Keys
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key

# Email Service
SENDGRID_API_KEY=your_sendgrid_key
SENDGRID_FROM_EMAIL=cards@papersaurus.com

# App Configuration
FLASK_PORT=5001
NEXT_PUBLIC_API_URL=http://localhost:5001
```

## 📱 Features in Detail

### Card Generation Process
1. **Input Details**: Fill out recipient info, occasion, and preferences
2. **AI Processing**: Our AI generates 5 unique card designs
3. **Preview & Select**: View all designs and choose your favorite
4. **Print or Email**: Get physical cards or send digital PDFs

### Reference Photo Feature
- Upload photos of people or pets
- AI analyzes and incorporates them into the front cover design
- Automatic compression for files over 10MB
- Smart person detection and naming

### Card Types Supported
- 🎂 Birthday
- 💑 Anniversary
- 🙏 Thank You
- 🎄 Holiday
- 💐 Sympathy
- 🎊 Congratulations
- ❤️ Love
- 🎯 Just Because

## 🏗️ Project Structure

```
Papersaurus/
├── ast_chat/               # Next.js frontend
│   ├── app/                # App router pages
│   ├── components/         # React components
│   ├── hooks/              # Custom React hooks
│   └── lib/                # Utility functions
├── mcp_client/            # MCP AI service
│   ├── mcp_servers/       # AI model integrations
│   └── mcp_service.py     # Main MCP server
├── data/                  # File storage
│   ├── cards/             # Generated card data
│   └── jobs/              # Job tracking
├── app.py                 # Flask backend
└── requirements.txt       # Python dependencies
```

## 🚦 API Endpoints

### Card Generation
- `POST /api/generate-card-async` - Start card generation job
- `GET /api/job-status/{job_id}` - Check generation progress

### Card Management
- `GET /view-card/{card_id}` - View saved card
- `POST /api/print-queue` - Add card to print queue
- `POST /send-thank-you-email` - Email card to recipient
- `POST /api/send-pdf-email` - Send PDF version

### WebSocket Events
- `subscribe` - Join job-specific room
- `status` - Generation progress updates
- `complete` - Card generation complete
- `error` - Error notifications

## 🧪 Development

### Running Tests
```bash
# Frontend tests
cd ast_chat
npm test

# Backend tests
python -m pytest
```

### Local Development
```bash
# Start all services
npm run dev:all

# Frontend only
npm run dev

# Backend only
python app.py

# MCP service
python mcp_client/mcp_service.py
```

## 🚀 Deployment

### Production Build
```bash
# Build Next.js app
cd ast_chat
npm run build

# Start production server
npm start
```

### Systemd Services (Linux)
```bash
# Frontend service
sudo systemctl restart papersaurus.service

# Backend service
sudo systemctl restart flask_app.service

# MCP service
sudo systemctl restart mcp_service.service
```

## 📊 Performance

- **Card Generation**: ~30-60 seconds per card
- **Image Compression**: Automatic for files >10MB
- **WebSocket Reconnection**: Exponential backoff
- **Job Persistence**: Survives server restarts

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- **TypeScript**: Follow Airbnb style guide
- **Python**: PEP 8 compliance
- **Commits**: Conventional commits format

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **Jordan Gilbert** - Initial work - [JordanJGilbert](https://github.com/JordanJGilbert)

## 🙏 Acknowledgments

- OpenAI for GPT image generation
- Google for Gemini AI models
- The open-source community

## 📞 Support

For issues and questions:
- Open an issue on [GitHub](https://github.com/JordanJGilbert/Papersaurus/issues)
- Visit our website at [papersaurus.com](https://papersaurus.com)

## 🚧 Roadmap

- [ ] Multi-language support
- [ ] Card templates library
- [ ] Advanced message editing
- [ ] Social sharing features
- [ ] User accounts and saved cards
- [ ] Batch card generation
- [ ] Custom fonts and styles
- [ ] Animation effects

---

Made with ❤️ and 🦕 by the Papersaurus team