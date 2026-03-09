require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { createStuffDocumentsChain } = require("@langchain/classic/chains/combine_documents");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { createRetrievalChain } = require("@langchain/classic/chains/retrieval");
const vectorStoreManager = require('./src/vectorStore');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize LLM
const llm = new ChatGoogleGenerativeAI({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-2.5-flash",
    temperature: 0,
    maxOutputTokens: 1024,
});

const prompt = ChatPromptTemplate.fromTemplate(`
You are a wise and scholarly assistant based on the philosophy of Immanuel Kant, using only the provided context.

System Instructions:
1. Your only source of information is the "Context" below. Do not use external knowledge.
2. You must answer ONLY in HEBREW.
3. If the answer is not in the text, state that you do not know. Do not hallucinate.
4. Style: Use clear, pleasant, and professional language suitable for a philosophy student.
5. If the user asks who you are, say you are an AI assistant helping to understand Kant's works.

<context>
{context}
</context>

Question: {input}
`);

app.get('/api/status', async (req, res) => {
    try {
        await vectorStoreManager.getVectorStore();
        res.json({ status: 'ready', message: 'Vector store is loaded and ready.' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    const startTime = Date.now();
    try {
        const { message } = req.body;
        console.log(`[${new Date().toISOString()}] Received message:`, message);

        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        console.log('Loading vector store...');
        const vectorStore = await vectorStoreManager.getVectorStore();
        console.log('Vector store loaded, creating retriever...');
        const retriever = vectorStore.asRetriever({ k: 4 });

        console.log('Creating combine docs chain...');
        const combineDocsChain = await createStuffDocumentsChain({
            llm,
            prompt,
        });

        console.log('Creating retrieval chain...');
        const retrievalChain = await createRetrievalChain({
            retriever,
            combineDocsChain,
        });

        console.log('Invoking retrieval chain...');
        // For simplicity in this iteration, we start with a non-streaming response
        // Wrapping it in a streaming capability is possible but let's ensure base functionality first

        // Add timeout wrapper
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout after 120 seconds')), 120000);
        });

        console.log('Retrieving relevant documents...');
        const docs = await retriever.invoke(message);
        console.log(`Retrieved ${docs.length} documents, calling LLM...`);

        const response = await Promise.race([
            retrievalChain.invoke({
                input: message,
            }),
            timeoutPromise
        ]);

        console.log('Retrieval chain completed.');

        // Extract sources
        const sources = response.context ? response.context.map(doc => doc.metadata.source) : [];
        const uniqueSources = [...new Set(sources)];

        const elapsedTime = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] Sending response (took ${elapsedTime}ms) with answer and sources`);
        res.json({
            answer: response.answer,
            sources: uniqueSources
        });

    } catch (error) {
        const elapsedTime = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] Error in chat endpoint (after ${elapsedTime}ms):`, error);
        console.error("Error stack:", error.stack);

        // Make sure we send a response even if there's an error
        if (!res.headersSent) {
            let statusCode = 500;
            let errorMessage = 'שגיאה פנימית בעיבוד הבקשה שלך.';
            let errorDetails = error.message;

            // Check for Anthropic API credit error
            if (error.message && error.message.includes('credit balance is too low')) {
                statusCode = 402; // Payment Required
                errorMessage = 'אין מספיק קרדיטים בחשבון Anthropic. אנא הוסף קרדיטים בחשבון שלך.';
                errorDetails = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
            } else if (error.message && error.message.includes('anthropic')) {
                statusCode = 503; // Service Unavailable
                errorMessage = 'שירות Anthropic API לא זמין כרגע.';
            }

            res.status(statusCode).json({
                error: errorMessage,
                details: errorDetails
            });
        }
    }
});

app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Initializing vector store...");
    await vectorStoreManager.getVectorStore();
    console.log("Initialization complete.");
});
