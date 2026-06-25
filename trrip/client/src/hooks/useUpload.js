import { useState, useRef } from 'react';
import { uploadDocuments, getUploadStatus } from '../api/upload';
import { createItinerary, getItineraryStatus } from '../api/itinerary';
import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from '../utils/constants';

const PHASES = {
  IDLE: 'idle',
  UPLOADING: 'uploading',
  EXTRACTING: 'extracting',
  GENERATING: 'generating',
  DONE: 'done',
  ERROR: 'error',
};

const poll = (fn, interval, timeout) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      if (Date.now() - start > timeout) {
        return reject(new Error('Processing timed out. Please try again.'));
      }
      try {
        const result = await fn();
        if (result.done) return resolve(result.value);
        setTimeout(tick, interval);
      } catch (err) {
        reject(err);
      }
    };
    tick();
  });

export const useUpload = () => {
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [itineraryId, setItineraryId] = useState(null);
  const abortRef = useRef(false);

  const reset = () => {
    abortRef.current = false;
    setPhase(PHASES.IDLE);
    setUploadProgress(0);
    setError(null);
    setItineraryId(null);
  };

  const processFiles = async (files, customTitle) => {
    abortRef.current = false;
    setError(null);
    setPhase(PHASES.UPLOADING);
    setUploadProgress(0);

    try {
      // Phase 1: Upload files
      const formData = new FormData();
      files.forEach((file) => formData.append('files', file));

      const uploadRes = await uploadDocuments(formData, (pct) => setUploadProgress(pct));
      const { uploadIds } = uploadRes.data;

      // Phase 2: Poll extraction status for each upload
      if (abortRef.current) return;
      setPhase(PHASES.EXTRACTING);

      await poll(
        async () => {
          const statuses = await Promise.all(uploadIds.map((id) => getUploadStatus(id)));
          const all = statuses.map((r) => r.data.status);
          const anyFailed = all.some((s) => s === 'failed');
          const allDone = all.every((s) => s === 'done' || s === 'failed');
          if (anyFailed && allDone) {
            const doneCount = all.filter((s) => s === 'done').length;
            if (doneCount === 0) throw new Error('All documents failed to process. Please try again.');
          }
          return { done: allDone && all.some((s) => s === 'done'), value: uploadIds };
        },
        POLL_INTERVAL_MS,
        POLL_TIMEOUT_MS
      );

      // Phase 3: Create itinerary (triggers async generation)
      if (abortRef.current) return;
      setPhase(PHASES.GENERATING);

      const itinRes = await createItinerary({ uploadIds, title: customTitle });
      const { itinerary } = itinRes.data;
      setItineraryId(itinerary._id);

      // Phase 4: Poll generation status
      await poll(
        async () => {
          const res = await getItineraryStatus(itinerary._id);
          const { status, error: genError } = res.data;
          if (status === 'failed') throw new Error(genError || 'Itinerary generation failed.');
          return { done: status === 'done', value: itinerary._id };
        },
        POLL_INTERVAL_MS,
        POLL_TIMEOUT_MS
      );

      if (!abortRef.current) setPhase(PHASES.DONE);
    } catch (err) {
      if (!abortRef.current) {
        setError(err.response?.data?.message || err.message || 'Something went wrong.');
        setPhase(PHASES.ERROR);
      }
    }
  };

  const cancel = () => {
    abortRef.current = true;
    reset();
  };

  return {
    phase,
    phases: PHASES,
    uploadProgress,
    error,
    itineraryId,
    processFiles,
    cancel,
    reset,
    isIdle: phase === PHASES.IDLE,
    isProcessing: [PHASES.UPLOADING, PHASES.EXTRACTING, PHASES.GENERATING].includes(phase),
    isDone: phase === PHASES.DONE,
    isError: phase === PHASES.ERROR,
  };
};
