import express from 'express';
import { MongoClient, ObjectId} from 'mongodb';
import { ElevenLabsClient } from "elevenlabs";
const app = express();

app.use(express.json());

// MongoDB connection URL
const uri = "mongodb+srv://kacperurbanowski05:0aji8Wm0w12CDrju@cluster0.b6yoi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";
const dbName = 'myDatabase';

// Connection function
async function connectToMongo() {
    try {
        const client = await MongoClient.connect(uri);
        console.log('Connected successfully to MongoDB');
        return client.db(dbName);
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

const ELEVENLABS_API_KEY = 'sk_643d42f2e85e431fc182c588d2d99cb922436b1b68b16d14';
const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

app.use(express.json());

const client = new ElevenLabsClient({
    apiKey: 'sk_643d42f2e85e431fc182c588d2d99cb922436b1b68b16d14'
});

function createInterviewPrompt(title, questions) {
    return `
You are a professional interviewer conducting an interview for ${title}. 
Your role is to ask the following questions in order:
${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Instructions:
1. Ask one question at a time
2. Listen to the candidate's response
3. Ask relevant follow-up questions if needed
4. Move to the next question when ready
5. Maintain a professional and friendly tone
6. Take notes on key points from responses

Start by introducing yourself and asking the first question.`;
}

// Campaign creation endpoint
app.post('/campaigns', async (req, res) => {
    try {
        const db = await connectToMongo();

        // Validate request body
        const { Title, Questions = [] } = req.body;
        if (!Title) {
            return res.status(400).json({
                success: false,
                error: 'Title is required'
            });
        }

        // Create campaign document
        const campaign = {
            Title,
            Questions,
            createdAt: new Date()
        };

        // Insert campaign into MongoDB
        const campaignResult = await db.collection('campaigns').insertOne(campaign);

        try {
            const interviewPrompt = createInterviewPrompt(Title, Questions);

            // Create agent using ElevenLabs SDK
            const agentResponse = await client.conversationalAi.createAgent({
                name: `${Title} Interviewer`,
                conversation_config: {
                    agent:{prompt: {
                            prompt: interviewPrompt
                        }},
                    initial_message: "Hello, I'll be conducting your interview today.",
                    voice_id: "21m00Tcm4TlvDq8ikWAM",
                    language: "en",
                    audio_settings: {
                        stability: 0.75,
                        similarity_boost: 0.75
                    }
                }
            });

            const response = await client.conversationalAi.getAgentLink("0orWLPtt2qLxNrhuAD6o");
            console.log(response);
            console.log("0orWLPtt2qLxNrhuAD6o");

            // Update campaign with agent details
            await db.collection('campaigns').updateOne(
                { _id: campaignResult.insertedId },
                {
                    $set: {
                        convaiAgentId: agentResponse.agent_id,
                        interviewPrompt
                    }
                }
            );

            return res.status(201).json({
                success: true,
                campaignId: campaignResult.insertedId,
                campaign: {
                    ...campaign,
                    convaiAgentId: agentResponse.agent_id,
                    interviewPrompt
                }
            });

        } catch (convaiError) {
            // Still return success if campaign was created but agent creation failed
            return res.status(201).json({
                success: true,
                campaignId: campaignResult.insertedId,
                campaign,
                warning: 'Campaign created but agent creation failed',
                error: convaiError.message
            });
        }

    } catch (error) {
        console.error('Campaign creation error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create campaign',
            details: error.message
        });
    }
});

// Get campaign questions endpoint
app.get('/campaigns/:campaignId/questions', async (req, res) => {
    try {
        const db = await connectToMongo();
        const campaignId = new ObjectId(req.params.campaignId);

        const campaign = await db.collection('campaigns').findOne({ _id: campaignId });

        if (!campaign) {
            return res.status(404).json({
                success: false,
                error: 'Campaign not found'
            });
        }

        return res.json({
            success: true,
            Title: campaign.Title,
            Questions: campaign.Questions
        });
    } catch (error) {
        console.error('Error fetching questions:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch questions'
        });
    }
});

// Start server
app.listen("3003", () => {
    console.log(`Server running on port 3003`);
});

// Initialize MongoDB connection
connectToMongo();
