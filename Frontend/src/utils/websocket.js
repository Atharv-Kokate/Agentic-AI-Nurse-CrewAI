export const getWsUrl = (patientId) => {
    // 1. Determine Protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    // 2. Determine Host
    let host = window.location.host;

    // If VITE_API_URL is provided, extract the host from it safely
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
        try {
            // Handle cases where apiUrl might not have a protocol 
            // e.g., if it's just 'api.example.com' instead of 'https://api.example.com'
            const parsedUrl = new URL(apiUrl.startsWith('http') ? apiUrl : `https://${apiUrl}`);
            host = parsedUrl.host;
        } catch (e) {
            console.warn("Invalid VITE_API_URL, falling back to window.location.host", e);
        }
    }

    // 3. Get Auth Token
    const token = localStorage.getItem('token');

    // 4. Construct Final URL
    return `${protocol}//${host}/ws/${patientId}?token=${token}`;
};
