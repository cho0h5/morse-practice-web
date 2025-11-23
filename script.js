class MorseAudio {
    constructor() {
        this.audioCtx = null;
        this.oscillator = null;
        this.gainNode = null;
        this.frequency = 600; // Hz
    }

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();

            // Create persistent nodes
            this.oscillator = this.audioCtx.createOscillator();
            this.gainNode = this.audioCtx.createGain();

            this.oscillator.type = 'sine';
            this.oscillator.frequency.value = this.frequency;

            // Start silent
            this.gainNode.gain.value = 0;

            this.oscillator.connect(this.gainNode);
            this.gainNode.connect(this.audioCtx.destination);

            this.oscillator.start();
        }
    }

    startTone() {
        if (!this.audioCtx) return;

        // Very fast attack (1ms) for snappy feel, but avoiding click
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setTargetAtTime(1, now, 0.001);
    }

    stopTone() {
        if (!this.audioCtx) return;

        // Very fast release (1ms)
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setTargetAtTime(0, now, 0.001);
    }
}

const MORSE_CODE = {
    '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
    '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
    '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
    '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
    '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
    '--..': 'Z', '-----': '0', '.----': '1', '..---': '2', '...--': '3',
    '....-': '4', '.....': '5', '-....': '6', '--...': '7', '---..': '8',
    '----.': '9'
};

class MorseDecoder {
    constructor(updateUiCallback, updateTimerCallback) {
        this.updateUi = updateUiCallback;
        this.updateTimer = updateTimerCallback;
        this.currentSequence = '';
        this.decodedText = '';
        this.startTime = 0;
        this.charTimeout = null;
        this.wordTimeout = null;
        this.timerInterval = null;

        // Default Timing
        this.setWpm(20);
    }

    setWpm(wpm) {
        this.WPM = wpm;

        // Standard Morse Timing Formula (PARIS standard)
        // Dot duration = 1200 / WPM (ms)
        const unit = 1200 / wpm;

        this.DOT_DURATION = unit;      // Dot vs Dash threshold (usually unit, but we use it as threshold)
        // Actually, for recognition, we need a threshold between dot (1 unit) and dash (3 units).
        // A good threshold is around 2 units? Or 1.5 units?
        // Let's use 2 units as the cutoff.
        this.DOT_THRESHOLD = unit * 2;

        this.CHAR_GAP = unit * 3;
        this.WORD_GAP = unit * 7;

        // console.log(`WPM: ${wpm}, Unit: ${Math.round(unit)}ms, Threshold: ${Math.round(this.DOT_THRESHOLD)}ms`);
    }

    startSignal() {
        this.startTime = Date.now();
        clearTimeout(this.charTimeout);
        clearTimeout(this.wordTimeout);
        clearInterval(this.timerInterval);
        this.updateTimer(0, 'reset');
    }

    endSignal() {
        const duration = Date.now() - this.startTime;

        const symbol = duration < this.DOT_THRESHOLD ? '.' : '-';

        this.currentSequence += symbol;

        // Look up preview
        const preview = MORSE_CODE[this.currentSequence] || '';
        this.updateUi(this.decodedText, this.currentSequence, preview);

        // Start visual timer
        this.startTimer();

        // Set timeout to commit character
        this.charTimeout = setTimeout(() => this.commitCharacter(), this.CHAR_GAP);
    }

    startTimer() {
        const start = Date.now();
        clearInterval(this.timerInterval);

        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - start;

            if (elapsed < this.CHAR_GAP) {
                // Stage 1: Character Lock
                const progress = (elapsed / this.CHAR_GAP) * 100;
                this.updateTimer(progress, 'char');
            } else if (elapsed < this.WORD_GAP) {
                // Stage 2: Word Space
                const wordElapsed = elapsed - this.CHAR_GAP;
                const wordDuration = this.WORD_GAP - this.CHAR_GAP;
                const progress = (wordElapsed / wordDuration) * 100;
                this.updateTimer(progress, 'word');
            } else {
                clearInterval(this.timerInterval);
                this.updateTimer(100, 'done');
            }
        }, 16);
    }

    commitCharacter() {
        const char = MORSE_CODE[this.currentSequence];
        if (char) {
            this.decodedText += char;
        } else {
            // Optional: handle unknown sequences
            // this.decodedText += '?';
        }
        this.currentSequence = '';
        this.updateUi(this.decodedText, this.currentSequence, '');

        // Timer continues running for Word Gap...

        // Set timeout to add space
        this.wordTimeout = setTimeout(() => {
            this.decodedText += ' ';
            this.updateUi(this.decodedText, this.currentSequence, '');
        }, this.WORD_GAP - this.CHAR_GAP);
    }

    clear() {
        this.decodedText = '';
        this.currentSequence = '';
        this.updateUi(this.decodedText, this.currentSequence, '');
        this.updateTimer(0, 'reset');
    }
}

const app = {
    audio: new MorseAudio(),
    decoder: null,
    ui: {
        statusLight: document.getElementById('status-light'),
        keyKnob: document.getElementById('key-knob'),
        decodedText: document.getElementById('decoded-text'),
        currentSequence: document.getElementById('current-sequence'),
        timerBar: document.getElementById('timer-bar')
    },
    isKeyDown: false,

    init() {
        this.decoder = new MorseDecoder(
            (text, seq, preview) => {
                this.ui.decodedText.textContent = text;

                // Show sequence + preview
                if (preview) {
                    this.ui.currentSequence.innerHTML = `${seq} <span class="preview-char">(${preview})</span>`;
                } else {
                    this.ui.currentSequence.textContent = seq;
                }
            },
            (progress, stage) => {
                this.ui.timerBar.style.width = `${progress}%`;

                if (stage === 'char') {
                    this.ui.timerBar.style.backgroundColor = 'var(--primary-color)';
                    this.ui.timerBar.style.opacity = '1';
                } else if (stage === 'word') {
                    this.ui.timerBar.style.backgroundColor = 'var(--accent-color)';
                    this.ui.timerBar.style.opacity = '1';
                } else if (stage === 'reset') {
                    this.ui.timerBar.style.width = '0%';
                    this.ui.timerBar.style.opacity = '0';
                } else if (stage === 'done') {
                    this.ui.timerBar.style.opacity = '0';
                }
            }
        );

        // WPM Slider
        const wpmSlider = document.getElementById('wpm-slider');
        const wpmValue = document.getElementById('wpm-value');
        const msValue = document.getElementById('ms-value');

        wpmSlider.addEventListener('input', (e) => {
            const wpm = parseInt(e.target.value);
            wpmValue.textContent = wpm;
            msValue.textContent = Math.round(1200 / wpm);
            this.decoder.setWpm(wpm);
        });

        // Clear Button
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.decoder.clear();
        });

        // Keyboard interaction
        document.addEventListener('keydown', (e) => {
            if (e.repeat || this.isKeyDown) return;
            this.ensureAudioContext();
            this.isKeyDown = true;
            this.activate();
        });

        document.addEventListener('keyup', () => {
            this.isKeyDown = false;
            this.deactivate();
        });

        // Mouse/Touch interaction on the knob
        this.ui.keyKnob.addEventListener('mousedown', () => {
            this.ensureAudioContext();
            this.activate();
        });
        this.ui.keyKnob.addEventListener('mouseup', () => this.deactivate());
        this.ui.keyKnob.addEventListener('mouseleave', () => this.deactivate());

        this.ui.keyKnob.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling/zooming
            this.ensureAudioContext();
            this.activate();
        });
        this.ui.keyKnob.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.deactivate();
        });

        this.setupPhraseClicks();
        this.setupMobileAudioUnlock();
    },

    ensureAudioContext() {
        // Lazy init audio on first interaction
        this.audio.init();

        // Always try to resume if suspended (needed for mobile)
        if (this.audio.audioCtx && this.audio.audioCtx.state === 'suspended') {
            this.audio.audioCtx.resume().then(() => {
                // console.log('AudioContext resumed');
            });
        }
    },

    setupMobileAudioUnlock() {
        // Global unlock for mobile browsers
        const unlock = () => {
            this.ensureAudioContext();
            // Remove listener after first successful unlock attempt
            if (this.audio.audioCtx && this.audio.audioCtx.state === 'running') {
                document.removeEventListener('touchstart', unlock);
                document.removeEventListener('click', unlock);
            }
        };

        document.addEventListener('touchstart', unlock, { passive: true });
        document.addEventListener('click', unlock, { passive: true });
    },

    activate() {
        this.audio.startTone();
        this.decoder.startSignal();
        this.ui.statusLight.classList.add('active');
        this.ui.keyKnob.classList.add('active');
    },

    deactivate() {
        this.audio.stopTone();
        this.decoder.endSignal();
        this.ui.statusLight.classList.remove('active');
        this.ui.keyKnob.classList.remove('active');
    },

    async playSequence(sequence, cardElement) {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.ensureAudioContext();

        // Visual feedback
        if (cardElement) cardElement.classList.add('playing');

        const unit = this.decoder.DOT_DURATION;

        for (const char of sequence) {
            if (!this.isPlaying) break; // Allow cancellation

            if (char === '.') {
                this.audio.startTone();
                this.ui.statusLight.classList.add('active');
                await new Promise(r => setTimeout(r, unit));
                this.audio.stopTone();
                this.ui.statusLight.classList.remove('active');
            } else if (char === '-') {
                this.audio.startTone();
                this.ui.statusLight.classList.add('active');
                await new Promise(r => setTimeout(r, unit * 3));
                this.audio.stopTone();
                this.ui.statusLight.classList.remove('active');
            } else if (char === ' ') {
                // Word gap (7 units), but we already waited 1 unit after last symbol + 3 units for char gap?
                // Simplified: Just wait for word gap
                await new Promise(r => setTimeout(r, unit * 3));
            }

            // Inter-symbol gap (1 unit)
            await new Promise(r => setTimeout(r, unit));
        }

        // Cleanup
        if (cardElement) cardElement.classList.remove('playing');
        this.isPlaying = false;
    },

    setupPhraseClicks() {
        const cards = document.querySelectorAll('.phrase-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                const code = card.querySelector('.phrase-code').textContent;
                // Clean up code string (remove spaces between letters for playback logic if needed, 
                // but our simple player handles chars one by one. 
                // Actually, the display has spaces between letters (e.g. "-.-. --.-").
                // We need to handle that space as a character gap (3 units).
                // My simple player above treats ' ' as 3 units.

                // Let's refine the player logic slightly in the loop above?
                // The loop handles '.' and '-' and ' '.
                // Standard: 
                // . = 1 unit on, 1 unit off
                // - = 3 units on, 1 unit off
                // Space between chars = 3 units off (so 1 unit off from last symbol + 2 more)
                // Space between words = 7 units off

                // Current code in sidebar: "-.-. --.-" (CQ)
                // The space there is a character gap (between C and Q).
                // So ' ' in that string should be a character gap.

                this.playSequence(code, card);
            });
        });
    }
};

app.init();
