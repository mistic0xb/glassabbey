import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Navbar from "./components/layout/Navbar";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Dashboard from "./pages/admin/Dashboard";
import CreateCollection from "./pages/admin/CreateCollection";
import AddPieces from "./pages/admin/AddPieces";
import ExploreCollection from "./pages/ExploreCollection";
import BiddingPage from "./pages/BiddingPage";
import Payment from "./pages/Payment";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <>{children}</> : <Navigate to="/" replace />;
};

const App = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Navbar />
        <main className="min-h-screen bg-[url('/bg.webp')] bg-cover bg-center bg-fixed">
          <div className="min-h-screen bg-black/80 backdrop-blur-sm">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route
                path="/explore/:slug/:id"
                element={<ExploreCollection />}
              />
              <Route path="/piece/:id" element={<BiddingPage />} />
              <Route path="/payment/:slug/:id" element={<Payment />} />
              <Route
                path="/admin/dashboard"
                element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/collection/create"
                element={
                  <ProtectedRoute>
                    <CreateCollection />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/collection/:id/add-pieces"
                element={
                  <ProtectedRoute>
                    <AddPieces />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
