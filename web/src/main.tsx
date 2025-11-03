import ReactDOM from "react-dom/client";

import App from "./App";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  // <React.StrictMode> <-- this causes the session viewer to render twice
  <App />,
  // </React.StrictMode>
);
