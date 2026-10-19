import admin from "firebase-admin";

const serviceAccountPromise = import(
  "./firebase-services-admin.json",
  {
    with: { type: "json" },
  }
);

serviceAccountPromise.then(({ default: serviceAccount }) => {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }
});

export default admin;
