# Pesticide Club Shop ERP & Inventory Management System

## Phase 0: Project Foundation, Routing, Auth & UI Libraries

This repository contains the full technical foundation for the **Pesticide Club Shop ERP & Inventory Management System**.

### Architecture Overview

```text
pesticide-erp/
├── frontend/             # React + TypeScript + Vite + Tailwind + shadcn/ui
│   ├── src/
│   │   ├── app/          # App root and React Router configuration
│   │   ├── components/   # UI components (shadcn/ui + custom)
│   │   ├── features/     # Feature-sliced modules (auth, etc.)
│   │   ├── layouts/      # Base layouts (AuthLayout, DashboardLayout)
│   │   ├── lib/          # Utilities and Axios API client
│   │   ├── hooks/        # Custom hooks
│   │   ├── types/        # TypeScript interfaces & types
│   │   └── main.tsx      # Vite entry point
│   └── components.json   # shadcn/ui configuration
│
├── backend/              # Python Django + Django REST Framework + SimpleJWT
│   ├── config/           # Django project configuration (settings, urls, wsgi)
│   ├── apps/
│   │   └── accounts/     # Custom User model, Roles, SimpleJWT Auth endpoints
│   ├── manage.py
│   └── requirements.txt
│
├── .env.example
├── .gitignore
└── README.md
```

### Color Palette & Design System
- **Primary Color:** `#015AA0`
- **Secondary / Neutral:** `#D1D1D1`
- **UI Libraries:** Tailwind CSS + shadcn/ui + Lucide React + Uiverse component readiness

### User Roles
- `OWNER`
- `MANAGER`
- `SALESMAN`
- `ACCOUNTANT`

### Setup Instructions

#### Backend Setup
1. Navigate to backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   # Windows PowerShell:
   .venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables in `backend/.env` (see `backend/.env.example`).
5. Run migrations:
   ```bash
   python manage.py migrate
   ```
6. Start development server:
   ```bash
   python manage.py runserver 8000
   ```

#### Frontend Setup
1. Navigate to frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `frontend/.env` (see `frontend/.env.example`).
4. Start Vite development server:
   ```bash
   npm run dev
   ```
