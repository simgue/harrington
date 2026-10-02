// Fail-closed Commune stub. Nothing imports it since HAR-23 removed the
// Commune views; it stays so tests/isolation.test.mjs can prove the service
// rejects without making an external request.

function unavailable() {
  return Promise.reject(new Error('Commune is not available in the self-hosted preview yet'));
}

export const createPod = unavailable;
export const joinPod = unavailable;
export const myPods = unavailable;
export const shareCard = unavailable;
export const cardsSharedToMe = unavailable;
