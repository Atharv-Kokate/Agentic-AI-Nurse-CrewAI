import React, { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';
import { jwtDecode } from "jwt-decode";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Check for existing token on mount
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                // We could also fetch full profile here if needed: /auth/me
                setUser({
                    id: decoded.sub,
                    email: decoded.email,
                    role: decoded.role
                });
            } catch (e) {
                console.error("Invalid token", e);
                localStorage.removeItem('token');
            }
        }
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        try {
            // Using form data login as per backend
            const formData = new FormData();
            formData.append('username', email);
            formData.append('password', password);

            const response = await client.post('/auth/login', formData, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const { access_token } = response.data;
            localStorage.setItem('token', access_token);

            const decoded = jwtDecode(access_token);
            setUser({
                id: decoded.sub,
                email: decoded.email,
                role: decoded.role
            });

            return true;
        } catch (error) {
            console.error("Login failed", error);
            throw error;
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        setUser(null);
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
