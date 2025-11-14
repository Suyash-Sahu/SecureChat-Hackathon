// Consent modal component for handling suspicious files

(function(global) {
    'use strict';
    
    class ConsentModal {
        constructor() {
            this.modal = null;
            this.resolve = null;
            this.reject = null;
        }

        /**
         * Show consent modal for suspicious file
         * @param {object} scanReport - The steganography scan report
         * @param {string} fileSHA256 - The SHA256 hash of the file
         * @returns {Promise<boolean>} - Promise that resolves with user consent decision
         */
        show(scanReport, fileSHA256) {
            return new Promise((resolve, reject) => {
                this.resolve = resolve;
                this.reject = reject;

                // Create modal HTML
                const modalHTML = `
                    <div id="consentModal" class="consent-modal">
                        <div class="consent-modal-content">
                            <div class="consent-modal-header">
                                <h2>⚠️ Suspicious File Detected</h2>
                                <button id="closeConsentModal" class="close-btn">&times;</button>
                            </div>
                            <div class="consent-modal-body">
                                <p>Our analysis has detected potential hidden data in this file:</p>
                                <div class="scan-report">
                                    <h3>Scan Report</h3>
                                    <p><strong>Method:</strong> ${scanReport.method}</p>
                                    <p><strong>Risk Level:</strong> ${scanReport.risk}</p>
                                    ${scanReport.patterns.length > 0 ? 
                                        `<p><strong>Detected Patterns:</strong></p>
                                        <ul>${scanReport.patterns.map(p => `<li>${p}</li>`).join('')}</ul>` : 
                                        ''}
                                </div>
                                <div class="file-info">
                                    <p><strong>File Hash:</strong> ${fileSHA256}</p>
                                </div>
                                <div class="consent-warning">
                                    <p><strong>Important:</strong> If you proceed, a cryptographic proof of this file will be stored on the blockchain. This creates a permanent, public record.</p>
                                </div>
                            </div>
                            <div class="consent-modal-footer">
                                <button id="rejectConsent" class="btn btn-secondary">Reject File</button>
                                <button id="acceptConsent" class="btn btn-primary">Accept & Proceed</button>
                            </div>
                        </div>
                    </div>
                `;

                // Add modal to DOM
                document.body.insertAdjacentHTML('beforeend', modalHTML);

                // Get modal elements
                this.modal = document.getElementById('consentModal');
                const closeBtn = document.getElementById('closeConsentModal');
                const rejectBtn = document.getElementById('rejectConsent');
                const acceptBtn = document.getElementById('acceptConsent');

                // Add event listeners
                closeBtn.addEventListener('click', () => this.close(false));
                rejectBtn.addEventListener('click', () => this.close(false));
                acceptBtn.addEventListener('click', () => this.close(true));

                // Close on escape key
                const handleEscKey = (event) => {
                    if (event.key === 'Escape') {
                        this.close(false);
                    }
                };
                document.addEventListener('keydown', handleEscKey);

                // Store reference to event handler for cleanup
                this.handleEscKey = handleEscKey;

                // Show modal
                this.modal.style.display = 'block';
            });
        }

        /**
         * Close modal with user decision
         * @param {boolean} consent - Whether user consented
         */
        close(consent) {
            // Remove event listeners
            if (this.handleEscKey) {
                document.removeEventListener('keydown', this.handleEscKey);
            }

            // Hide modal
            if (this.modal) {
                this.modal.style.display = 'none';
                this.modal.remove();
            }

            // Resolve promise
            if (this.resolve) {
                if (consent) {
                    this.resolve(true);
                } else {
                    this.resolve(false);
                }
            }

            // Clean up
            this.modal = null;
            this.resolve = null;
            this.reject = null;
            this.handleEscKey = null;
        }
    }

    // Create a global instance
    global.consentModal = new ConsentModal();
})(window);