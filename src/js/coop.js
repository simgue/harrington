// Commune is intentionally unavailable until it can run on Harrington-owned
// infrastructure. Keeping these exports makes retained upstream views fail
// clearly if opened directly, without making an external request.

function unavailable() {
  return Promise.reject(new Error('Commune is not available in the self-hosted preview yet'));
}

export const createPod = unavailable;
export const joinPod = unavailable;
export const myPods = unavailable;
export const shareCard = unavailable;
export const cardsSharedToMe = unavailable;
