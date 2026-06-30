import { Navigate, Route, Routes } from "react-router-dom";

import { TierListPage } from "@/features/tier-list/TierListPage";

/**
 * REST-style routes. The board component is the same for every route; it reads
 * the URL (`/`, `/rooms`, `/rooms/:roomId`) to decide solo vs. lobby vs. a
 * specific realtime room.
 *
 *   /                → solo board (local edit)
 *   /rooms           → lobby (room list)
 *   /rooms/:roomId   → a specific multiplayer room
 */
function App() {
  return (
    <Routes>
      <Route path="/" element={<TierListPage />} />
      <Route path="/rooms" element={<TierListPage />} />
      <Route path="/rooms/:roomId" element={<TierListPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
