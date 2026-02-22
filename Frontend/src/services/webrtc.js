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
        // Try video+audio first, then fallback to audio-only, then dummy stream
        const attempts = [
            { video: true, audio: true },
            { video: false, audio: true },
            { video: true, audio: false },
        ];

        for (const constraints of attempts) {
            try {
                this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
                console.log("Got local stream with constraints:", constraints);
                return this.localStream;
            } catch (err) {
                console.warn(`getUserMedia failed for ${JSON.stringify(constraints)}:`, err.name);
            }
        }

        // All attempts failed — create a silent dummy stream so signaling still works
        console.warn("All media attempts failed. Using dummy stream (no camera/mic).");
        this.localStream = new MediaStream();
        return this.localStream;
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

            if (event.streams && event.streams[0]) {
                this.remoteStream = event.streams[0];
            } else {
                this.remoteStream.addTrack(event.track);
            }
            this.onRemoteStream && this.onRemoteStream(this.remoteStream);
        };

        this.peerConnection.onconnectionstatechange = () => {
            console.log("Connection State Changed:", this.peerConnection.connectionState);
            this.onConnectionStateChange && this.onConnectionStateChange(this.peerConnection.connectionState);

            // Sometimes ontrack fires but the stream fails to visually attach until connected
            if (this.peerConnection.connectionState === 'connected') {
                this.onRemoteStream && this.onRemoteStream(this.remoteStream);
            }
        };

        this.peerConnection.oniceconnectionstatechange = () => {
            console.log("ICE Connection State:", this.peerConnection.iceConnectionState);
        };

        this.peerConnection.onicegatheringstatechange = () => {
            console.log("ICE Gathering State:", this.peerConnection.iceGatheringState);
        };
    }

    async createOffer() {
        this.createPeerConnection();
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        this.onSignal && this.onSignal({ type: 'offer', offer: offer });
    }

    async handleSignal(data) {
        if (data.type === 'offer') {
            if (!this.peerConnection) this.createPeerConnection();
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
            if (!this.peerConnection) this.createPeerConnection();
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
                if (this.peerConnection && this.peerConnection.remoteDescription && this.peerConnection.remoteDescription.type) {
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
