require('dotenv').config();
const fs = require('fs');
const path = require('path');

// ייבוא הספריות
const { ChatAnthropic } = require("@langchain/anthropic");
const { HuggingFaceInferenceEmbeddings } = require("@langchain/community/embeddings/hf");

// --- תיקון: ייבוא מקובץ ה-community ---
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
// --- תיקון: שימוש בחבילה החדשה שהתקנו ---
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
// --- תיקון: ייבוא ה-VectorStore מ-@langchain/classic ---
const { MemoryVectorStore } = require("@langchain/classic/vectorstores/memory");
const { createStuffDocumentsChain } = require("@langchain/classic/chains/combine_documents");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { createRetrievalChain } = require("@langchain/classic/chains/retrieval");

// --- הגדרות ---
const BOOKS_DIR = path.join(__dirname, "books");
const CLAUDE_MODEL = "claude-4-5-sonnet-20240620";

async function runBot() {
    console.log("--- מתחיל אתחול הבוט (מבוסס Claude) ---");

    try {
        // 1. טעינת כל קבצי ה-PDF מהתיקייה
        console.log(`1. טוען את כל קבצי ה-PDF מתיקיית books...`);

        // מציאת כל קבצי ה-PDF בתיקייה
        const files = fs.readdirSync(BOOKS_DIR).filter(file => file.toLowerCase().endsWith('.pdf'));
        console.log(`   נמצאו ${files.length} קבצי PDF: ${files.join(', ')}`);

        // טעינת כל הקבצים
        const allDocs = [];
        for (const file of files) {
            const filePath = path.join(BOOKS_DIR, file);
            console.log(`   טוען: ${file}...`);
            const loader = new PDFLoader(filePath);
            const docs = await loader.load();

            // הוספת שם הקובץ לכל מסמך למטרות מעקב
            docs.forEach(doc => {
                doc.metadata.source = file;
            });

            allDocs.push(...docs);
            console.log(`   ✓ נטענו ${docs.length} עמודים מ-${file}`);
        }

        console.log(`   סה"כ נטענו ${allDocs.length} מסמכים מכל הספרים\n`);
        const docs = allDocs;

        // 2. חיתוך הטקסט
        console.log("2. חותך את הטקסט...");
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        const splitDocs = await splitter.splitDocuments(docs);

        // 3. יצירת מנוע חיפוש וקטורי
        console.log("3. יוצר אינדקס וקטורי...");
        const vectorStore = await MemoryVectorStore.fromDocuments(
            splitDocs,
            new HuggingFaceInferenceEmbeddings({
                model: "sentence-transformers/all-MiniLM-L6-v2", // מודל embeddings חינמי וטוב
                apiKey: process.env.HUGGINGFACE_API_KEY // אופציונלי - יכול לעבוד גם בלי
            })
        );

        const retriever = vectorStore.asRetriever({ k: 4 });

        // 4. הגדרת המוח (Claude)
        const llm = new ChatAnthropic({
            anthropicApiKey: process.env.CLAUDE_API,
            modelName: CLAUDE_MODEL,
            temperature: 0,
            maxTokens: 1024,
        });

        const prompt = ChatPromptTemplate.fromTemplate(`
      אתה עוזר חכם ומלומד המבוסס על התוכן המצורף.
      
      הוראות מערכת:
      1. המקור היחיד שלך הוא הטקסט למטה ("Context"). אל תשתמש בידע חיצוני.
      2. עליך לענות אך ורק בשפה העברית.
      3. אם התשובה לא בטקסט, תגיד שאינך יודע. אל תמציא.
      4. סגנון: השתמש בשפה ברורה, נעימה ומקצועית.

      <context>
      {context}
      </context>

      שאלה: {input}
    `);

        // 5. בניית השרשרת
        const combineDocsChain = await createStuffDocumentsChain({
            llm,
            prompt,
        });

        const retrievalChain = await createRetrievalChain({
            retriever,
            combineDocsChain,
        });

        // --- בדיקה ---
        const question = "מהו הצו הקטגורי וכיצד הוא משפיע על המוסר?";

        console.log("\n--------------------------------------------------");
        console.log(`שואל את Claude: "${question}"`);
        console.log("--------------------------------------------------");

        const response = await retrievalChain.invoke({
            input: question,
        });

        console.log(`\nתשובת Claude:\n${response.answer}`);
        console.log("\n--------------------------------------------------");

    } catch (error) {
        console.error("שגיאה בריצה:", error);
    }
}

runBot();