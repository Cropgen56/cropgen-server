import BiodropsCardEvent from "../models/biodrops-card-event.model.js";

export async function logCardEvent({
  cardId = null,
  batchId = null,
  eventType,
  actorType = "system",
  actorId = null,
  metadata = {},
}) {
  return BiodropsCardEvent.create({
    cardId,
    batchId,
    eventType,
    actorType,
    actorId,
    metadata,
  });
}
