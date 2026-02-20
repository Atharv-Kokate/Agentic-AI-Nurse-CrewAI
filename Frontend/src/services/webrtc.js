class WebRTCService {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = new MediaStream();
        this.onSignal = null; // Callback to send signal to signaling server
        this.onRemoteStream = null; // Callback when remote stream is ready
        this.onConnectionStateChange = null;

        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        this.candidateBuffer = [];
        this.isSettingRemoteDescription = false;
    }

    async startLocalStream() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            return this.localStream;
        } catch (err) {
            console.error("Error accessing media devices:", err);
            throw err;
        }
    }

    createPeerConnection() {
        if (this.peerConnection) return;

        this.peerConnection = new RTCPeerConnection(this.config);

        // Add local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.peerConnection.addTrack(track, this.localStream);
            });
        }

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.onSignal && this.onSignal({ type: 'candidate', candidate: event.candidate });
            }
        };

        // Handle remote tracks
        this.peerConnection.ontrack = (event) => {
            console.log("Remote track received:", event.streams[0]);
            event.streams[0].getTracks().forEach(track => {
                this.remoteStream.addTrack(track);
            });
            this.onRemoteStream && this.onRemoteStream(this.remoteStream);
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log("Connection State:", this.peerConnection.connectionState);
            this.onConnectionStateChange && this.onConnectionStateChange(this.peerConnection.connectionState);
        };
    }

    async createOffer() {
        this.createPeerConnection();
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.onSignal && this.onSignal({ type: 'offer', offer: offer });
    }

    async handleSignal(data) {
        if (!this.peerConnection) this.createPeerConnection();

        if (data.type === 'offer') {
            this.isSettingRemoteDescription = true;
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);
                this.onSignal && this.onSignal({ type: 'answer', answer: answer });

                // Process buffered candidates
                this.processCandidateBuffer();
            } finally {
                this.isSettingRemoteDescription = false;
            }
        } else if (data.type === 'answer') {
            this.isSettingRemoteDescription = true;
            try {
                await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));

                // Process buffered candidates
                this.processCandidateBuffer();
            } finally {
                this.isSettingRemoteDescription = false;
            }
        } else if (data.type === 'candidate') {
            if (data.candidate) {
                // Check if we are ready to add candidate
                if (this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
                    try {
                        await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
                    } catch (e) {
                        console.error("Error adding candidate:", e);
                    }
                } else {
                    // Buffer it
                    console.log("Buffering candidate (no remote description)");
                    this.candidateBuffer.push(data.candidate);
                }
            }
        }
    }

    async processCandidateBuffer() {
        console.log(`Processing ${this.candidateBuffer.length} buffered candidates`);
        while (this.candidateBuffer.length > 0) {
            const candidate = this.candidateBuffer.shift();
            try {
                await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error("Error adding buffered candidate:", e);
            }
        }
    }

    close() {
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        // Don't clear remote stream object itself, but maybe remove tracks?
        // New instance is better. 
        this.remoteStream = new MediaStream();
        this.candidateBuffer = [];
        this.isSettingRemoteDescription = false;
    }
}

export default new WebRTCService();
