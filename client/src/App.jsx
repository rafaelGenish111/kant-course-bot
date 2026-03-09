import { useState, useRef, useEffect } from 'react';
import { Send, BookOpen, User, Bot, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function App() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'שלום. אני עוזר AI המתמחה בפילוסופיה של עמנואל קאנט. כיצד אוכל לסייע לך בחקירותיך היום?',
      sources: []
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Check if server is running on mount
    fetch('http://localhost:3001/api/status')
      .then(res => res.json())
      .then(data => console.log('Server status:', data))
      .catch(err => console.error('Server not reachable:', err));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage, sources: [] }]);
    setIsLoading(true);

    try {
      console.log('Sending message to server:', userMessage);

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

      const response = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Server error:', errorData);

        // Use the Hebrew error message from server if available
        const errorMessage = errorData.error || `שגיאת שרת: ${response.status}`;
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Response data:', data);

      if (data.answer) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer,
          sources: data.sources || []
        }]);
      } else {
        throw new Error('No answer in response');
      }
    } catch (error) {
      console.error('Error:', error);
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);

      let errorMessage = 'אני מתנצל, אך אינני יכול להתחבר לבסיס הידע שלי כרגע.';

      if (error.name === 'AbortError') {
        errorMessage = 'הבקשה ארכה יותר מדי זמן. השרת לא מגיב. אנא ודא שהשרת רץ ונסה שוב.';
      } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        errorMessage = 'לא ניתן להתחבר לשרת. אנא ודא שהשרת רץ על פורט 3001.';
      } else if (error.message.includes('קרדיטים')) {
        // Use the error message directly if it's already in Hebrew
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage,
        sources: []
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-kant-bg overflow-hidden font-sans text-kant-ink" dir="rtl">
      {/* Header */}
      <header className="bg-kant-paper border-b border-kant-accent/20 p-4 shadow-sm z-10 flex items-center justify-center">
        <BookOpen className="w-6 h-6 ml-2 text-kant-accent" />
        <h1 className="text-2xl font-serif font-bold text-kant-ink tracking-tight">קאנט AI</h1>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <AnimatePresence initial={false}>
            {messages.map((msg, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex gap-4 ${msg.role === 'user' ? 'flex-row' : 'flex-row-reverse'}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border border-kant-ink/10 ${msg.role === 'user' ? 'bg-kant-accent text-white' : 'bg-kant-paper text-kant-accent'}`}>
                  {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
                </div>

                <div className={`flex flex-col max-w-[80%] ${msg.role === 'user' ? 'items-start' : 'items-end'}`}>
                  <div className={`p-4 rounded-2xl shadow-sm text-base leading-relaxed ${msg.role === 'user'
                    ? 'bg-kant-accent text-white rounded-tl-none'
                    : 'bg-kant-paper text-kant-ink rounded-tr-none border border-kant-ink/5'
                    }`}>
                    {msg.content}
                  </div>

                  {/* Sources citation for assistant */}
                  {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                    <div className="mt-2 text-xs text-kant-muted flex flex-wrap gap-2">
                      <span className="font-semibold uppercase tracking-wider text-[10px]">מקורות:</span>
                      {msg.sources.map((source, idx) => (
                        <span key={idx} className="bg-kant-paper/50 px-2 py-0.5 rounded border border-kant-ink/10 italic truncate max-w-[200px]">
                          {source.replace('.pdf', '')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-kant-paper border border-kant-ink/10 flex items-center justify-center flex-shrink-0 text-kant-accent">
                <Bot size={20} />
              </div>
              <div className="bg-kant-paper p-4 rounded-2xl rounded-tr-none border border-kant-ink/5 flex items-center gap-2 text-kant-muted">
                <Loader2 className="animate-spin w-4 h-4" />
                <span className="text-sm italic">חושב...</span>
              </div>
            </motion.div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="bg-kant-paper p-4 border-t border-kant-accent/10">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל את עמנואל קאנט..."
              className="w-full bg-white border border-kant-ink/10 rounded-xl py-3 pr-4 pl-12 focus:outline-none focus:ring-2 focus:ring-kant-accent/50 focus:border-transparent transition-all placeholder:text-kant-muted/50 font-sans"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute left-2 p-2 bg-kant-accent text-white rounded-lg hover:bg-kant-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send size={18} />
            </button>
          </form>
          <div className="text-center mt-2 text-[10px] text-kant-muted uppercase tracking-widest opacity-60">
            מופעל על ידי RAG & Claude Sonnet
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
