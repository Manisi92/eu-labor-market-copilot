import "@/App.css";
import ChatApp from "@/components/ChatApp";
import { Toaster } from "@/components/ui/sonner";

function App() {
  return (
    <div className="App">
      <ChatApp />
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
