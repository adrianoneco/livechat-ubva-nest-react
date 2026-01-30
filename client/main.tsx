import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Silence informational logs in development: keep warnings and errors only
if (typeof console !== 'undefined') {
	const noop = () => {};
	if (process.env.NODE_ENV === 'development') {
		console.log = noop as any;
		console.info = noop as any;
		console.debug = noop as any;
	}
}

createRoot(document.getElementById("root")!).render(<App />);
