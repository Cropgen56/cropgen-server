# 🌱 CropGen Web Application Backend

The CropGen Web Application Backend powers the server-side functionality for the CropGen platform, enabling advanced crop data analysis and management using geospatial data from Google Earth Engine.

---

## 📖 Description

The CropGen Web Application Backend provides robust server-side logic to support the CropGen platform. It facilitates crop data analysis and management by leveraging geospatial information from Google Earth Engine, offering a scalable and secure backend for agricultural data processing.

---

## ✨ Features

- **User Authentication & Authorization:** Secure user management with JWT-based authentication.  
- **File Upload & Management:** Seamless file handling and storage using Cloudinary.  
- **Geospatial Data Processing:** Analyze crop data with Google Earth Engine integration.  
- **Email Notifications:** Automated email alerts powered by Nodemailer.  
- **RESTful API Endpoints:** Well-structured APIs for seamless frontend integration.  
- **Database Management:** Dual support for MongoDB (via Mongoose) and MySQL (via Sequelize).  

---

## 🛠️ Technologies Used

- **Node.js:** Runtime environment for server-side JavaScript  
- **Express.js:** Web framework for building RESTful APIs  
- **MongoDB with Mongoose:** NoSQL database for flexible data storage  
- **MySQL with Sequelize:** Relational database for structured data  
- **Google Earth Engine:** Geospatial data processing and analysis  
- **Cloudinary:** Cloud-based file upload and management  
- **Firebase:** Backend services for authentication and notifications  
- **JWT:** Secure token-based authentication  
- **Jest:** Testing framework for unit and integration tests  

---

## Architecture

CropGen is the default platform; white-label clients (e.g. **Biodrops** / Satagro.ai) live under [`src/clients/`](src/clients/README.md). Client-specific auth routes and branding are grouped per client; shared APIs (`/v1/api/field`, advisory, etc.) stay in `src/routes/` and are unchanged.

HTTP handlers are grouped by domain in [`src/controllers/`](src/controllers/README.md). Shared helpers live in [`src/utils/`](src/utils/README.md). Joi request schemas live in [`src/validation/`](src/validation/README.md). Mongoose models use kebab-case `*.model.js` in [`src/models/`](src/models/README.md). Large product areas use [`src/features/`](src/features/agent/README.md) (e.g. `advisory/`, `agent/`). Routes import from these folders; URL paths are unchanged.

HTTP paths are **not** tied to folder names — see [`src/clients/README.md`](src/clients/README.md) for how routes are composed.

---

## 📋 Prerequisites

Before setting up the project, ensure you have the following:

- Node.js (version 14 or later)  
- MongoDB (running locally on port 27017 or configured via `MONGODB_URI`)  
- MySQL (running locally or configured via environment variables)  
- Google Earth Engine account with a service account key  
- Cloudinary account with API credentials  
- Firebase project with a service account key  
- Email account for sending notifications (e.g., Gmail)  

---

## 🚀 Installation

### 1. Clone the Repository:

```bash
git clone https://github.com/[username]/cropgen-web-application-backend.git
cd cropgen-web-application-backend
