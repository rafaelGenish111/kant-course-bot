require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { HNSWLib } = require("@langchain/community/vectorstores/hnswlib");
const { GoogleGenerativeAIEmbeddings } = require("@langchain/google-genai");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");

const BOOKS_DIR = path.join(__dirname, "../books");
const VECTOR_STORE_PATH = path.join(__dirname, "../data/vector_store");

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, "../data"))) {
    fs.mkdirSync(path.join(__dirname, "../data"));
}

const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "gemini-embedding-001",
});

class VectorStoreManager {
    constructor() {
        this.vectorStore = null;
    }

    async getVectorStore() {
        if (this.vectorStore) return this.vectorStore;

        if (fs.existsSync(VECTOR_STORE_PATH)) {
            console.log("Loading vector store from disk...");
            try {
                this.vectorStore = await HNSWLib.load(VECTOR_STORE_PATH, embeddings);
                console.log("Vector store loaded successfully.");
            } catch (error) {
                console.error("Error loading vector store, rebuilding...", error);
                await this.rebuildIndex();
            }
        } else {
            console.log("Vector store not found, building new index...");
            await this.rebuildIndex();
        }
        return this.vectorStore;
    }

    async rebuildIndex() {
        console.log("Scanning books directory...");
        const files = fs.readdirSync(BOOKS_DIR).filter(file => file.toLowerCase().endsWith('.pdf'));

        const allDocs = [];
        for (const file of files) {
            const filePath = path.join(BOOKS_DIR, file);
            console.log(`Loading: ${file}...`);
            const loader = new PDFLoader(filePath);
            const docs = await loader.load();

            // Add metadata
            docs.forEach(doc => {
                doc.metadata.source = file;
            });

            allDocs.push(...docs);
        }
        console.log(`Loaded ${allDocs.length} pages total.`);

        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const splitDocs = await splitter.splitDocuments(allDocs);

        console.log("Creating vector store...");

        // Filter out empty/whitespace-only chunks
        const validDocs = splitDocs.filter(doc => doc.pageContent.trim().length > 10);
        console.log(`Filtered to ${validDocs.length} valid chunks (from ${splitDocs.length})`);

        // Test embedding API before processing all documents
        console.log("Testing embedding API...");
        const testVector = await embeddings.embedQuery("test");
        if (!testVector || testVector.length === 0) {
            throw new Error("Embedding API returned empty result. Check your API key and quota.");
        }
        const numDimensions = testVector.length;
        console.log(`Embedding API working. Dimensions: ${numDimensions}`);

        // Embed documents in batches with delay to avoid rate limits
        const batchSize = 20;
        const texts = validDocs.map(doc => doc.pageContent);
        const totalBatches = Math.ceil(texts.length / batchSize);
        console.log(`Embedding ${texts.length} chunks in batches of ${batchSize}...`);
        const allVectors = [];
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;

            // Retry logic for each batch
            let vectors;
            for (let attempt = 1; attempt <= 3; attempt++) {
                vectors = await embeddings.embedDocuments(batch);
                const validCount = vectors.filter(v => v && v.length > 0).length;
                if (validCount === batch.length) break;
                console.log(`  Batch ${batchNum}: ${validCount}/${batch.length} valid, retry ${attempt}/3 in 5s...`);
                await new Promise(r => setTimeout(r, 5000));
            }

            allVectors.push(...vectors);
            console.log(`  Embedded batch ${batchNum}/${totalBatches}`);

            // Small delay between batches to avoid rate limits
            if (i + batchSize < texts.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Filter out any docs whose vectors came back empty
        const filteredVectors = [];
        const filteredDocs = [];
        for (let i = 0; i < allVectors.length; i++) {
            if (allVectors[i] && allVectors[i].length > 0) {
                filteredVectors.push(allVectors[i]);
                filteredDocs.push(validDocs[i]);
            }
        }

        if (filteredVectors.length === 0) {
            throw new Error("All embeddings returned empty. Your API quota may be exceeded. Please wait or enable billing.");
        }

        const skipped = allVectors.length - filteredVectors.length;
        console.log(`Valid vectors: ${filteredVectors.length}, skipped: ${skipped}`);

        this.vectorStore = new HNSWLib(embeddings, { space: "cosine", numDimensions });
        await this.vectorStore.addVectors(filteredVectors, filteredDocs);

        console.log("Saving vector store to disk...");
        await this.vectorStore.save(VECTOR_STORE_PATH);
        console.log("Vector store saved.");
    }
}

module.exports = new VectorStoreManager();
