import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
    // helpers to make seeding idempotent
    async function ensureModule(pathId: number, title: string, orderIndex: number, description?: string) {
        const existing = await prisma.module.findFirst({ where: { pathId, title } });
        if (existing) {
            const needsUpdate = (existing.orderIndex !== orderIndex) || (description !== undefined && existing.description !== description);
            if (needsUpdate) {
                return prisma.module.update({ where: { id: existing.id }, data: { orderIndex, description } });
            }
            return existing;
        }
        return prisma.module.create({ data: { pathId, title, orderIndex, description } });
    }

    async function renameModuleIfExists(pathId: number, oldTitle: string, newTitle: string) {
        const oldMod = await prisma.module.findFirst({ where: { pathId, title: oldTitle } });
        if (!oldMod) return null;
        const conflict = await prisma.module.findFirst({ where: { pathId, title: newTitle } });
        if (conflict) return conflict;
        return prisma.module.update({ where: { id: oldMod.id }, data: { title: newTitle } });
    }

    async function ensureResource(params: {
        moduleId: number;
        title: string;
        url: string;
        type?: any;
        estMinutes?: number | null;
        isFree?: boolean;
        sourceDomain?: string | null;
    }) {
        const { moduleId, title, url } = params;
        const byTitle = await prisma.resource.findFirst({ where: { moduleId, title } });
        if (byTitle) return byTitle;
        const byUrl = await prisma.resource.findFirst({ where: { moduleId, url } });
        if (byUrl) return byUrl;
        return prisma.resource.create({ data: params });
    }
    // optional admin user (auth comes later)
    await prisma.user.upsert({
        where: { email: "admin@example.com" },
        update: {},
        create: { email: "admin@example.com", passwordHash: "not-set", role: "ADMIN", name: "Admin" },
    });

    // Path: Frontend Foundations
    const fe = await prisma.path.upsert({
        where: { slug: "frontend-foundations" },
        update: { isPublished: true },
        create: {
            title: "Frontend Foundations",
            slug: "frontend-foundations",
            description: "HTML/CSS/JS essentials, then modern frameworks.",
            isPublished: true,
        },
    });

    // Align modules to curated curriculum (18 modules)
    // 1) HTML Semantics & Document Structure
    await renameModuleIfExists(fe.id, "Basics", "HTML Semantics & Document Structure");
    const feHtml = await ensureModule(fe.id, "HTML Semantics & Document Structure", 1, "Document anatomy, landmarks, and media semantics.");

    // 12) JavaScript Essentials (keep existing, will be re-ordered to 12)
    const feJs = await ensureModule(fe.id, "JavaScript Essentials", 12);

    await ensureResource({
        moduleId: feHtml.id,
        title: "MDN — Learn HTML",
        url: "https://developer.mozilla.org/en-US/docs/Learn/HTML",
        type: "DOC",
        estMinutes: 60,
        isFree: true,
        sourceDomain: "developer.mozilla.org",
    });
    await ensureResource({
        moduleId: feHtml.id,
        title: "MDN — Learn CSS",
        url: "https://developer.mozilla.org/en-US/docs/Learn/CSS",
        type: "DOC",
        estMinutes: 60,
        isFree: true,
        sourceDomain: "developer.mozilla.org",
    });
    await ensureResource({
        moduleId: feJs.id,
        title: "Eloquent JavaScript (Ch. 2-5)",
        url: "https://eloquentjavascript.net/",
        type: "DOC",
        estMinutes: 90,
        isFree: true,
        sourceDomain: "eloquentjavascript.net",
    });

    // 13) DOM, Events & Browser APIs (rename from DOM & Events)
    await renameModuleIfExists(fe.id, "DOM & Events", "DOM, Events & Browser APIs");
    const feDom = await ensureModule(fe.id, "DOM, Events & Browser APIs", 13, "Work with the DOM tree, events, and common browser APIs.");
    await ensureResource({
        moduleId: feDom.id,
        title: "MDN — Introduction to the DOM",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Document_Object_Model/Introduction",
        type: "DOC",
        estMinutes: 25,
        isFree: true,
        sourceDomain: "developer.mozilla.org",
    });
    await ensureResource({
        moduleId: feDom.id,
        title: "MDN — Introduction to events",
        url: "https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events",
        type: "DOC",
        estMinutes: 20,
        isFree: true,
        sourceDomain: "developer.mozilla.org",
    });
    await ensureResource({
        moduleId: feDom.id,
        title: "DOM Crash Course (Web Dev Simplified)",
        url: "https://www.youtube.com/watch?v=0ik6X4DJKCc",
        type: "VIDEO",
        estMinutes: 30,
        isFree: true,
        sourceDomain: "youtube.com",
    });

    // 12) Consolidate Modern JavaScript into JavaScript Essentials
    const feEs6Old = await prisma.module.findFirst({ where: { pathId: fe.id, title: "Modern JavaScript (ES6+)" } });
    if (feEs6Old) {
        const es6Resources = await prisma.resource.findMany({ where: { moduleId: feEs6Old.id } });
        for (const r of es6Resources) {
            await prisma.resource.update({ where: { id: r.id }, data: { moduleId: feJs.id } });
        }
        // Remove empty old module
        await prisma.module.delete({ where: { id: feEs6Old.id } });
    }
    await ensureResource({
        moduleId: feJs.id,
        title: "JavaScript.info — Variables",
        url: "https://javascript.info/variables",
        type: "DOC",
        estMinutes: 15,
        isFree: true,
        sourceDomain: "javascript.info",
    });
    await ensureResource({
        moduleId: feJs.id,
        title: "JavaScript.info — Arrow functions",
        url: "https://javascript.info/arrow-functions-basics",
        type: "DOC",
        estMinutes: 15,
        isFree: true,
        sourceDomain: "javascript.info",
    });
    await ensureResource({
        moduleId: feJs.id,
        title: "ES6 in 100 Seconds (Fireship)",
        url: "https://www.youtube.com/watch?v=NCwa_xi0Uuc",
        type: "VIDEO",
        estMinutes: 5,
        isFree: true,
        sourceDomain: "youtube.com",
    });

    // Add more JS essentials resources
    await ensureResource({ moduleId: feJs.id, title: "MDN — JavaScript Guide (Overview)", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", type: "DOC", estMinutes: 45, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feJs.id, title: "Closures Explained Visually (Web Dev Simplified)", url: "https://www.youtube.com/watch?v=3a0I8ICR1Vg", type: "VIDEO", estMinutes: 12, isFree: true, sourceDomain: "youtube.com" });

    // Split CSS Layout into Flexbox (5) and Grid (6)
    const oldLayout = await prisma.module.findFirst({ where: { pathId: fe.id, title: "CSS Layout — Flexbox & Grid" } });
    const feFlex = await ensureModule(fe.id, "Flexbox Layout Patterns", 5, "Common layout patterns with Flexbox.");
    const feGrid = await ensureModule(fe.id, "CSS Grid for Complex Layouts", 6, "Build complex responsive grids.");
    if (oldLayout) {
        const layoutResources = await prisma.resource.findMany({ where: { moduleId: oldLayout.id } });
        for (const r of layoutResources) {
            const title = r.title.toLowerCase();
            const targetModuleId = title.includes("grid") ? feGrid.id : feFlex.id;
            await prisma.resource.update({ where: { id: r.id }, data: { moduleId: targetModuleId } });
        }
        await prisma.module.delete({ where: { id: oldLayout.id } });
    }
    // Ensure key resources exist on each
    await ensureResource({ moduleId: feFlex.id, title: "MDN — Flexbox", url: "https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Flexbox", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feFlex.id, title: "Flexbox in 15 Minutes (Kevin Powell)", url: "https://www.youtube.com/watch?v=fYq5PXgSsbE", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: feFlex.id, title: "Common Flexbox Patterns (Modern CSS)", url: "https://moderncss.dev/common-flexbox-patterns/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "moderncss.dev" });
    await ensureResource({ moduleId: feGrid.id, title: "MDN — CSS Grid", url: "https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Grids", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feGrid.id, title: "CSS Grid Crash Course (Kevin Powell)", url: "https://www.youtube.com/watch?v=rg7Fvvl3taU", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });

    // 7) Responsive Design & Media Queries (rename and reorder)
    await renameModuleIfExists(fe.id, "Responsive Design", "Responsive Design & Media Queries");
    const feResponsive = await ensureModule(fe.id, "Responsive Design & Media Queries", 7, "Mobile-first, media queries, and responsive images.");
    await ensureResource({
        moduleId: feResponsive.id,
        title: "MDN — Responsive design",
        url: "https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design",
        type: "DOC",
        estMinutes: 25,
        isFree: true,
        sourceDomain: "developer.mozilla.org",
    });
    await ensureResource({
        moduleId: feResponsive.id,
        title: "Responsive Images: srcset & sizes (MDN)",
        url: "https://developer.mozilla.org/en-US/docs/Learn/HTML/Multimedia_and_embedding/Responsive_images",
        type: "DOC",
        estMinutes: 25,
        isFree: true,
        sourceDomain: "developer.mozilla.org",
    });
    await ensureResource({
        moduleId: feResponsive.id,
        title: "Mobile-first Responsive Design (Kevin Powell)",
        url: "https://www.youtube.com/watch?v=VQraviuwbzU",
        type: "VIDEO",
        estMinutes: 12,
        isFree: true,
        sourceDomain: "youtube.com",
    });

    // 16) Accessibility Fundamentals (rename + reorder)
    await renameModuleIfExists(fe.id, "Accessibility Basics", "Accessibility Fundamentals (a11y)");
    const feA11y = await ensureModule(fe.id, "Accessibility Fundamentals (a11y)", 16, "Build inclusive, usable interfaces.");
    await ensureResource({
        moduleId: feA11y.id,
        title: "web.dev — Learn Accessibility",
        url: "https://web.dev/learn/accessibility/",
        type: "DOC",
        estMinutes: 40,
        isFree: true,
        sourceDomain: "web.dev",
    });
    await ensureResource({
        moduleId: feA11y.id,
        title: "MDN — ARIA: Accessible Rich Internet Applications",
        url: "https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA",
        type: "DOC",
        estMinutes: 25,
        isFree: true,
        sourceDomain: "developer.mozilla.org",
    });
    await ensureResource({
        moduleId: feA11y.id,
        title: "Web Accessibility in 100 Seconds (Fireship)",
        url: "https://www.youtube.com/watch?v=2q3LFuShsZc",
        type: "VIDEO",
        estMinutes: 5,
        isFree: true,
        sourceDomain: "youtube.com",
    });
    await ensureResource({ moduleId: feA11y.id, title: "Skip Links & Focus Management", url: "https://webaim.org/techniques/skipnav/", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "webaim.org" });

    // 14) Async JS & Fetch (rename + reorder)
    await renameModuleIfExists(fe.id, "Async & APIs", "Async JS & Fetch");
    const feApi = await ensureModule(fe.id, "Async JS & Fetch", 14, "Fetching data and handling async code.");
    await ensureResource({
        moduleId: feApi.id,
        title: "MDN — Using Fetch",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
        type: "DOC",
        estMinutes: 20,
        isFree: true,
        sourceDomain: "developer.mozilla.org",
    });
    await ensureResource({
        moduleId: feApi.id,
        title: "JavaScript.info — Async/await",
        url: "https://javascript.info/async-await",
        type: "DOC",
        estMinutes: 25,
        isFree: true,
        sourceDomain: "javascript.info",
    });
    await ensureResource({
        moduleId: feApi.id,
        title: "Fetch API Crash Course (Web Dev Simplified)",
        url: "https://www.youtube.com/watch?v=cuEtnrL9-H0",
        type: "VIDEO",
        estMinutes: 20,
        isFree: true,
        sourceDomain: "youtube.com",
    });
    await ensureResource({ moduleId: feApi.id, title: "AbortController & Timeouts", url: "https://developer.mozilla.org/en-US/docs/Web/API/AbortController", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feApi.id, title: "CORS Explained (Jake Archibald)", url: "https://www.youtube.com/watch?v=Ka8vG5miErk", type: "VIDEO", estMinutes: 11, isFree: true, sourceDomain: "youtube.com" });

    // 17) Web Performance Basics (rename + reorder)
    await renameModuleIfExists(fe.id, "DevTools & Performance", "Web Performance Basics");
    const fePerf = await ensureModule(fe.id, "Web Performance Basics", 17, "Inspect, debug, and optimize.");
    await ensureResource({
        moduleId: fePerf.id,
        title: "Chrome DevTools Overview",
        url: "https://developer.chrome.com/docs/devtools/overview/",
        type: "DOC",
        estMinutes: 20,
        isFree: true,
        sourceDomain: "developer.chrome.com",
    });
    await ensureResource({
        moduleId: fePerf.id,
        title: "Image Optimization Guide (web.dev)",
        url: "https://web.dev/learn/performance/optimize-images/",
        type: "DOC",
        estMinutes: 30,
        isFree: true,
        sourceDomain: "web.dev",
    });
    // 2) Forms & Native Validation
    const feForms = await ensureModule(fe.id, "Forms & Native Validation", 2, "Inputs, semantics, and built-in validation.");
    await ensureResource({ moduleId: feForms.id, title: "MDN — Web forms overview", url: "https://developer.mozilla.org/en-US/docs/Learn/Forms", type: "DOC", estMinutes: 40, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feForms.id, title: "HTML5 Input Types & Attributes", url: "https://developer.mozilla.org/en-US/docs/Learn/Forms/HTML5_input_types", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feForms.id, title: "Constraint Validation API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Constraint_validation", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feForms.id, title: "Accessible Forms (WebAIM)", url: "https://webaim.org/techniques/forms/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "webaim.org" });

    // 3) CSS Selectors & Specificity
    const feSelectors = await ensureModule(fe.id, "CSS Selectors & Specificity", 3, "Selectors, pseudo classes, and cascade.");
    await ensureResource({ moduleId: feSelectors.id, title: "MDN — Selectors", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Selectors", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feSelectors.id, title: "Specificity Calculator", url: "https://specificity.keegan.st/", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "keegan.st" });
    await ensureResource({ moduleId: feSelectors.id, title: "Advanced Selectors: :is(), :where(), :not()", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/:is", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "developer.mozilla.org" });

    // 4) CSS Box Model & Visual Formatting
    const feBox = await ensureModule(fe.id, "CSS Box Model & Visual Formatting", 4, "Box sizing, positioning, and overflow.");
    await ensureResource({ moduleId: feBox.id, title: "MDN — Box Model", url: "https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/The_box_model", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feBox.id, title: "Positioning (MDN)", url: "https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Positioning", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feBox.id, title: "Stacking Contexts (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Positioning/Understanding_z-index/The_stacking_context", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "developer.mozilla.org" });

    // 8) Typography & Iconography
    const feType = await ensureModule(fe.id, "Typography & Iconography", 8, "Fonts, type scale, and icons.");
    await ensureResource({ moduleId: feType.id, title: "web.dev — Learn Typography Basics", url: "https://web.dev/learn/design/typography/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "web.dev" });
    await ensureResource({ moduleId: feType.id, title: "Variable Fonts Guide (web.dev)", url: "https://web.dev/learn/design/typography/variable-fonts/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "web.dev" });
    await ensureResource({ moduleId: feType.id, title: "SVG Icons Best Practices", url: "https://css-tricks.com/accessible-svgs/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "css-tricks.com" });

    // 9) Colors, Themes & CSS Variables
    const feColors = await ensureModule(fe.id, "Colors, Themes & CSS Variables", 9, "Design tokens and theming.");
    await ensureResource({ moduleId: feColors.id, title: "CSS Custom Properties (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feColors.id, title: "Dark Mode with prefers-color-scheme", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feColors.id, title: "Contrast Checker (WebAIM)", url: "https://webaim.org/resources/contrastchecker/", type: "DOC", estMinutes: 5, isFree: true, sourceDomain: "webaim.org" });

    // 10) Modern CSS Features
    const feModernCss = await ensureModule(fe.id, "Modern CSS Features", 10, "Layers, :has(), logical props, and nesting.");
    await ensureResource({ moduleId: feModernCss.id, title: "Cascade Layers (@layer)", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/@layer", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feModernCss.id, title: ":has() selector", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/:has", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feModernCss.id, title: "Logical Properties", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Logical_Properties", type: "DOC", estMinutes: 12, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feModernCss.id, title: "CSS Nesting (@nest)", url: "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_nesting", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "developer.mozilla.org" });

    // 11) CSS Architecture & Reuse
    const feArch = await ensureModule(fe.id, "CSS Architecture & Reuse", 11, "BEM, utilities, and composition.");
    await ensureResource({ moduleId: feArch.id, title: "BEM Methodology", url: "https://getbem.com/introduction/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "getbem.com" });
    await ensureResource({ moduleId: feArch.id, title: "Utility-First CSS (Tailwind Docs Intro)", url: "https://tailwindcss.com/docs/utility-first", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "tailwindcss.com" });
    await ensureResource({ moduleId: feArch.id, title: "CSS Modules — Concept", url: "https://github.com/css-modules/css-modules", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "github.com" });

    // 15) State & Data Modeling in the Browser
    const feState = await ensureModule(fe.id, "State & Data Modeling in the Browser", 15, "Client-side state and persistence.");
    await ensureResource({ moduleId: feState.id, title: "URL as UI State (MDN)", url: "https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Tools_and_setup/What_are_URL_search_parameters", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feState.id, title: "localStorage & sessionStorage (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API/Using_the_Web_Storage_API", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feState.id, title: "IndexedDB — Getting Started", url: "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: feState.id, title: "Zod for Validation", url: "https://zod.dev/?id=getting-started", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "zod.dev" });

    // 18) Tooling & TypeScript Intro
    const feTooling = await ensureModule(fe.id, "Tooling & TypeScript Intro", 18, "Tooling, linting, and TS basics.");
    await ensureResource({ moduleId: feTooling.id, title: "npm scripts — Guide", url: "https://docs.npmjs.com/cli/v10/using-npm/scripts", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "docs.npmjs.com" });
    await ensureResource({ moduleId: feTooling.id, title: "ESLint — Getting Started", url: "https://eslint.org/docs/latest/use/getting-started", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "eslint.org" });
    await ensureResource({ moduleId: feTooling.id, title: "Prettier — Setup", url: "https://prettier.io/docs/en/install.html", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "prettier.io" });
    await ensureResource({ moduleId: feTooling.id, title: "TypeScript — Handbook Intro", url: "https://www.typescriptlang.org/docs/handbook/intro.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({
        moduleId: fePerf.id,
        title: "Chrome DevTools Crash Course (Traversy Media)",
        url: "https://www.youtube.com/watch?v=H0XScE08hy8",
        type: "VIDEO",
        estMinutes: 45,
        isFree: true,
        sourceDomain: "youtube.com",
    });

    // Path: Backend Basics
    const be = await prisma.path.upsert({
        where: { slug: "backend-basics" },
        update: { isPublished: true },
        create: {
            title: "Backend Basics",
            slug: "backend-basics",
            description: "HTTP, REST, databases, auth.",
            isPublished: true,
        },
    });

    // Align Backend Basics to structured 18-module curriculum
    await renameModuleIfExists(be.id, "HTTP & REST", "HTTP Fundamentals & REST Semantics");

    // Create final module set with ordering
    const beHttp = await ensureModule(be.id, "HTTP Fundamentals & REST Semantics", 1, "Methods, status codes, headers, and REST.");
    const beApiDesign = await ensureModule(be.id, "Resource Modeling & API Design", 2, "Model resources and design pragmatic APIs.");
    const beExpress = await ensureModule(be.id, "Express Core & Routing", 3, "Routers, middleware, and graceful shutdown.");
    const beValidation = await ensureModule(be.id, "Validation & Serialization", 4, "Zod, DTOs, and safe output shaping.");
    const beAuthN = await ensureModule(be.id, "AuthN: Sessions vs JWT", 5, "Sessions, tokens, rotation, and throttling.");
    const beAuthZ = await ensureModule(be.id, "AuthZ: Roles & Permissions", 6, "RBAC vs ABAC and route guards.");
    const bePasswords = await ensureModule(be.id, "Passwords & Accounts", 7, "Secure password storage and account flows.");
    const beSchema = await ensureModule(be.id, "SQL Schema Design (MySQL)", 8, "Relations, constraints, and normalization.");
    const beQueries = await ensureModule(be.id, "Querying, Indexes & Performance", 9, "Indexes, EXPLAIN, and pagination.");
    const beTx = await ensureModule(be.id, "Transactions & Isolation", 10, "ACID and isolation levels.");
    const bePrisma = await ensureModule(be.id, "Prisma in Practice", 11, "Schema, queries, and transactions.");
    const beUploads = await ensureModule(be.id, "Files, Uploads & Streaming", 12, "Multipart, range, and S3.");
    const beCaching = await ensureModule(be.id, "Caching Strategies", 13, "HTTP vs Redis caching.");
    const beRate = await ensureModule(be.id, "Rate Limiting & Abuse Controls", 14, "Token bucket and sliding window.");
    const beSecurity = await ensureModule(be.id, "Security Essentials (OWASP)", 15, "OWASP, CORS, headers, secrets.");
    const beObs = await ensureModule(be.id, "Observability & Ops", 16, "Logs, metrics, tracing, health checks.");
    const beTesting = await ensureModule(be.id, "Testing Backend Systems", 17, "Unit, integration, E2E, contract.");
    const beJobs = await ensureModule(be.id, "Background Jobs & Real-Time", 18, "Queues, scheduling, websockets.");

    // Migrate legacy "Databases 101" resources to Querying/Performance, then remove module
    const oldDbBasics = await prisma.module.findFirst({ where: { pathId: be.id, title: "Databases 101" } });
    if (oldDbBasics) {
        const dbRes = await prisma.resource.findMany({ where: { moduleId: oldDbBasics.id } });
        for (const r of dbRes) {
            await prisma.resource.update({ where: { id: r.id }, data: { moduleId: beQueries.id } });
        }
        await prisma.module.delete({ where: { id: oldDbBasics.id } });
    }

    // 1) HTTP Fundamentals & REST Semantics
    await ensureResource({ moduleId: beHttp.id, title: "MDN — HTTP Overview", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: beHttp.id, title: "MDN — Request Methods", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "developer.mozilla.org" });

    // 2) Resource Modeling & API Design
    await ensureResource({ moduleId: beApiDesign.id, title: "JSON:API — Format", url: "https://jsonapi.org/format/", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "jsonapi.org" });

    // 3) Express Core & Routing
    await ensureResource({ moduleId: beExpress.id, title: "Express — Routing", url: "https://expressjs.com/en/guide/routing.html", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "expressjs.com" });
    await ensureResource({ moduleId: beExpress.id, title: "Express — Using Middleware", url: "https://expressjs.com/en/guide/using-middleware.html", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "expressjs.com" });
    await ensureResource({ moduleId: beExpress.id, title: "Graceful Shutdown in Node", url: "https://learn.microsoft.com/azure/architecture/framework/resiliency/app-design#graceful-degradation-and-shutdown", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "learn.microsoft.com" });

    // 4) Validation & Serialization
    await ensureResource({ moduleId: beValidation.id, title: "Zod — Getting Started", url: "https://zod.dev/?id=getting-started", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "zod.dev" });
    await ensureResource({ moduleId: beValidation.id, title: "Express Error Handling", url: "https://expressjs.com/en/guide/error-handling.html", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "expressjs.com" });
    await ensureResource({ moduleId: beValidation.id, title: "DTOs & Output Shaping", url: "https://martinfowler.com/articles/replaceThrowWithNotification.html", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "martinfowler.com" });

    // 5) AuthN: Sessions vs JWT
    await ensureResource({ moduleId: beAuthN.id, title: "Cookies vs Tokens (Auth0)", url: "https://auth0.com/blog/cookies-vs-tokens-definitive-guide/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "auth0.com" });
    await ensureResource({ moduleId: beAuthN.id, title: "OWASP Session Management", url: "https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "owasp.org" });
    await ensureResource({ moduleId: beAuthN.id, title: "Refresh Token Rotation", url: "https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "auth0.com" });

    // 6) AuthZ: Roles & Permissions
    await ensureResource({ moduleId: beAuthZ.id, title: "OWASP Access Control", url: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "owasp.org" });
    await ensureResource({ moduleId: beAuthZ.id, title: "RBAC vs ABAC", url: "https://auth0.com/blog/role-based-access-control-rbac-and-attribute-based-access-control-abac/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "auth0.com" });
    await ensureResource({ moduleId: beAuthZ.id, title: "Policy Checks in Node (CASL)", url: "https://casl.js.org/v6/en/guide/intro", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "casl.js.org" });

    // 7) Passwords & Accounts
    await ensureResource({ moduleId: bePasswords.id, title: "OWASP Password Storage", url: "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "owasp.org" });
    await ensureResource({ moduleId: bePasswords.id, title: "Argon2 Parameters", url: "https://github.com/P-H-C/phc-winner-argon2/blob/master/README.md", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: bePasswords.id, title: "Credential Stuffing Basics", url: "https://developer.okta.com/blog/2019/03/04/what-are-brute-force-attacks", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "okta.com" });

    // 8) SQL Schema Design (MySQL)
    await ensureResource({ moduleId: beSchema.id, title: "Database Normalization", url: "https://www.vertabelo.com/blog/database-normalization-1nf-2nf-3nf-bcnf/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "vertabelo.com" });
    await ensureResource({ moduleId: beSchema.id, title: "MySQL Foreign Keys", url: "https://dev.mysql.com/doc/refman/8.0/en/create-table-foreign-keys.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "dev.mysql.com" });
    await ensureResource({ moduleId: beSchema.id, title: "Soft Deletes vs Archival", url: "https://www.prisma.io/dataguide/database-tools/soft-deletes", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "prisma.io" });

    // 9) Querying, Indexes & Performance
    await ensureResource({ moduleId: beQueries.id, title: "Use The Index, Luke!", url: "https://use-the-index-luke.com/", type: "DOC", estMinutes: 45, isFree: true, sourceDomain: "use-the-index-luke.com" });
    await ensureResource({ moduleId: beQueries.id, title: "EXPLAIN Basics (Postgres)", url: "https://www.postgresql.org/docs/current/using-explain.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "postgresql.org" });
    await ensureResource({ moduleId: beQueries.id, title: "Pagination: Cursor vs Offset", url: "https://shopify.engineering/pagination-relative-cursors", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "shopify.engineering" });

    // 10) Transactions & Isolation
    await ensureResource({ moduleId: beTx.id, title: "Transaction Isolation Levels", url: "https://www.postgresql.org/docs/current/transaction-iso.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "postgresql.org" });
    await ensureResource({ moduleId: beTx.id, title: "Isolation Explained Visually", url: "https://www.braintreepayments.com/blog/what-every-developer-should-know-about-database-isolation-levels/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "braintreepayments.com" });
    await ensureResource({ moduleId: beTx.id, title: "Deadlocks & Retries", url: "https://www.cockroachlabs.com/blog/what-is-a-deadlock/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "cockroachlabs.com" });

    // 11) Prisma in Practice
    await ensureResource({ moduleId: bePrisma.id, title: "Prisma — Relations", url: "https://www.prisma.io/docs/orm/prisma-schema/relations", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "prisma.io" });
    await ensureResource({ moduleId: bePrisma.id, title: "Prisma — Transactions", url: "https://www.prisma.io/docs/orm/prisma-client/queries/transactions", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "prisma.io" });
    await ensureResource({ moduleId: bePrisma.id, title: "Prisma — Performance", url: "https://www.prisma.io/docs/guides/performance-and-optimization/understanding-prisma-performance", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "prisma.io" });

    // 12) Files, Uploads & Streaming
    await ensureResource({ moduleId: beUploads.id, title: "Multer — File Uploads", url: "https://github.com/expressjs/multer", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: beUploads.id, title: "HTTP Range Requests (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: beUploads.id, title: "S3 Pre-signed URLs", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/ShareObjectPreSignedURL.html", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "aws.amazon.com" });

    // 13) Caching Strategies
    await ensureResource({ moduleId: beCaching.id, title: "HTTP Caching (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: beCaching.id, title: "Redis Caching Patterns", url: "https://redis.io/docs/latest/develop/use-cases/caching/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "redis.io" });
    await ensureResource({ moduleId: beCaching.id, title: "Cache Stampede Control", url: "https://en.wikipedia.org/wiki/Cache_stampede", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "wikipedia.org" });

    // 14) Rate Limiting & Abuse Controls
    await ensureResource({ moduleId: beRate.id, title: "Token Bucket vs Leaky Bucket", url: "https://www.cloudflare.com/learning/ddos/glossary/rate-limiting/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "cloudflare.com" });
    await ensureResource({ moduleId: beRate.id, title: "express-rate-limit", url: "https://github.com/express-rate-limit/express-rate-limit", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: beRate.id, title: "429 & Retry-After (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429", type: "DOC", estMinutes: 5, isFree: true, sourceDomain: "developer.mozilla.org" });

    // 15) Security Essentials (OWASP)
    await ensureResource({ moduleId: beSecurity.id, title: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "owasp.org" });
    await ensureResource({ moduleId: beSecurity.id, title: "CORS Guide (MDN)", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "developer.mozilla.org" });
    await ensureResource({ moduleId: beSecurity.id, title: "Helmet — Secure HTTP Headers", url: "https://helmetjs.github.io/", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "helmetjs.github.io" });

    // 16) Observability & Ops
    await ensureResource({ moduleId: beObs.id, title: "Pino — Node Logger", url: "https://github.com/pinojs/pino", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: beObs.id, title: "OpenTelemetry for Node", url: "https://opentelemetry.io/docs/languages/js/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "opentelemetry.io" });
    await ensureResource({ moduleId: beObs.id, title: "Health & Readiness Probes", url: "https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "kubernetes.io" });

    // 17) Testing Backend Systems
    await ensureResource({ moduleId: beTesting.id, title: "Supertest — Integration Testing", url: "https://github.com/ladjs/supertest", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: beTesting.id, title: "Jest — Getting Started", url: "https://jestjs.io/docs/getting-started", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "jestjs.io" });
    await ensureResource({ moduleId: beTesting.id, title: "Contract Testing with OpenAPI (Prism)", url: "https://github.com/stoplightio/prism", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "github.com" });

    // 18) Background Jobs & Real-Time
    await ensureResource({ moduleId: beJobs.id, title: "BullMQ — Queues in Node", url: "https://docs.bullmq.io/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "docs.bullmq.io" });
    await ensureResource({ moduleId: beJobs.id, title: "WebSockets vs SSE vs Webhooks", url: "https://ably.com/topic/websockets-vs-sse", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "ably.com" });
    await ensureResource({ moduleId: beJobs.id, title: "node-cron — Scheduling", url: "https://github.com/node-cron/node-cron", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "github.com" });

    // Path: React Essentials
    const react = await prisma.path.upsert({
        where: { slug: "react-essentials" },
        update: { isPublished: true },
        create: {
            title: "React Essentials",
            slug: "react-essentials",
            description: "Comprehensive React mastery: from fundamentals to advanced patterns, performance, and production deployment.",
            isPublished: true,
        },
    });

    // Comprehensive React curriculum (25 modules)
    const rMentalModel = await ensureModule(react.id, "React Mental Model & JSX", 1, "Component model, declarative UI, JSX rules, TSX setup");
    const rComponentsProps = await ensureModule(react.id, "Components & Props (TSX)", 2, "Function components, prop types with TypeScript, default/optional props");
    const rStateEvents = await ensureModule(react.id, "State & Events", 3, "useState, event handlers, lifting state up, derived state pitfalls");
    const rListsKeys = await ensureModule(react.id, "Lists, Keys & Conditional UI", 4, "Rendering arrays, stable keys, conditional rendering patterns");
    const rEffectsLifecycle = await ensureModule(react.id, "Effects & Lifecycle Basics", 5, "useEffect, deps array, cleanup, avoiding infinite loops");
    const rDataFetching = await ensureModule(react.id, "Data Fetching 101", 6, "Fetching in effects, loading/error states, aborting, minimal caching");
    const rControlledForms = await ensureModule(react.id, "Controlled Forms", 7, "Controlled vs uncontrolled, validation basics, input/select/checkbox");
    const rContext = await ensureModule(react.id, "Context for Prop Drilling Relief", 8, "createContext, useContext, provider design, context + TS types");
    const rCustomHooks = await ensureModule(react.id, "Custom Hooks", 9, "Extracting logic, input/output typing, avoiding re-render traps");
    const rPerformance = await ensureModule(react.id, "Performance Essentials", 10, "React.memo, useMemo, useCallback, render costs, lists perf");
    const rErrorHandling = await ensureModule(react.id, "Error Handling & Boundaries", 11, "Error boundaries (class + wrapper), fallback UIs, retry patterns");
    const rRouting = await ensureModule(react.id, "Routing with React Router", 12, "Routes, nested routes, params, search params, guarded routes");
    const rStyling = await ensureModule(react.id, "Styling Options", 13, "CSS Modules, Tailwind basics, styled-components tradeoffs");
    const rAccessibility = await ensureModule(react.id, "Accessibility (a11y)", 14, "Semantic markup, ARIA basics, focus management, keyboard nav");
    const rTesting = await ensureModule(react.id, "Testing React", 15, "React Testing Library, user events, mocking fetch, component contracts");
    const rAsyncPatterns = await ensureModule(react.id, "Async Patterns & Suspense (Client)", 16, "Suspense for data, useTransition, skeletons vs spinners");
    const rStateManagement = await ensureModule(react.id, "State Management Beyond React", 17, "When context isn't enough, Redux Toolkit vs Zustand, selectors, immutability");
    const rFormsScale = await ensureModule(react.id, "Forms at Scale", 18, "React Hook Form + Zod, schema types via z.infer, error messages");
    const rAnimations = await ensureModule(react.id, "Animations & Micro-interactions", 19, "Framer Motion basics, transitions, layout animations, accessibility concerns");
    const rNextJs = await ensureModule(react.id, "Next.js Essentials (App Router)", 20, "Pages vs server components, route handlers, metadata, data fetching on server, use client");
    const rAPIIntegration = await ensureModule(react.id, "API Integration Patterns", 21, "Typed API layer (fetch wrapper), pagination, optimistic UI, retries/backoff");
    const rProductionDeploy = await ensureModule(react.id, "Production Build & Deploy", 22, "Vite/Next builds, env vars, bundle analysis, code splitting, hosting (Vercel/Netlify)");
    const rAdvancedPatterns = await ensureModule(react.id, "Advanced Component Patterns", 23, "Compound components, controller/controlled, headless UI, slot props");

    // Resources for React Mental Model & JSX
    await ensureResource({ moduleId: rMentalModel.id, title: "React — Quick Start", url: "https://react.dev/learn", type: "DOC", estMinutes: 45, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rMentalModel.id, title: "Describing the UI", url: "https://react.dev/learn/describing-the-ui", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rMentalModel.id, title: "React JSX Tutorial", url: "https://www.youtube.com/watch?v=7fPXI_MnBOY", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Components & Props (TSX)
    await ensureResource({ moduleId: rComponentsProps.id, title: "Passing Props to a Component", url: "https://react.dev/learn/passing-props-to-a-component", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rComponentsProps.id, title: "React + TypeScript Cheatsheets", url: "https://react-typescript-cheatsheet.netlify.app/docs/basic/setup/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react-typescript-cheatsheet.netlify.app" });
    await ensureResource({ moduleId: rComponentsProps.id, title: "TypeScript Props Tutorial", url: "https://www.youtube.com/watch?v=F2JCjVSZlG0", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for State & Events
    await ensureResource({ moduleId: rStateEvents.id, title: "State: A Component's Memory", url: "https://react.dev/learn/state-a-components-memory", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rStateEvents.id, title: "Responding to Events", url: "https://react.dev/learn/responding-to-events", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rStateEvents.id, title: "useState Hook Tutorial", url: "https://www.youtube.com/watch?v=O6P86uwfdR0", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Lists, Keys & Conditional UI
    await ensureResource({ moduleId: rListsKeys.id, title: "Rendering Lists", url: "https://react.dev/learn/rendering-lists", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rListsKeys.id, title: "Keeping List Items in Order with Key", url: "https://react.dev/learn/keeping-list-items-in-order", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rListsKeys.id, title: "Conditional Rendering", url: "https://react.dev/learn/conditional-rendering", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "react.dev" });

    // Resources for Effects & Lifecycle Basics
    await ensureResource({ moduleId: rEffectsLifecycle.id, title: "useEffect", url: "https://react.dev/reference/react/useEffect", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rEffectsLifecycle.id, title: "Synchronizing with Effects", url: "https://react.dev/learn/synchronizing-with-effects", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rEffectsLifecycle.id, title: "useEffect Hook Tutorial", url: "https://www.youtube.com/watch?v=0ZJgIjI0Yvs", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Data Fetching 101
    await ensureResource({ moduleId: rDataFetching.id, title: "Data Fetching in React", url: "https://react.dev/learn/synchronizing-with-effects#fetching-data", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rDataFetching.id, title: "React Data Fetching Patterns", url: "https://www.youtube.com/watch?v=00RoZflFE34", type: "VIDEO", estMinutes: 18, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rDataFetching.id, title: "Aborting Fetch Requests", url: "https://developer.mozilla.org/en-US/docs/Web/API/AbortController", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "developer.mozilla.org" });

    // Resources for Controlled Forms
    await ensureResource({ moduleId: rControlledForms.id, title: "React Forms Crash Course", url: "https://www.youtube.com/watch?v=yk7nVp5HTCk", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rControlledForms.id, title: "Forms in React", url: "https://react.dev/reference/react-dom/components/form", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rControlledForms.id, title: "Controlled vs Uncontrolled Components", url: "https://react.dev/learn/forms", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "react.dev" });

    // Resources for Context for Prop Drilling Relief
    await ensureResource({ moduleId: rContext.id, title: "Passing Data Deeply with Context", url: "https://react.dev/learn/passing-data-deeply-with-context", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rContext.id, title: "useContext Hook", url: "https://react.dev/reference/react/useContext", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rContext.id, title: "React Context Tutorial", url: "https://www.youtube.com/watch?v=5LrDIWkK_Bc", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Custom Hooks
    await ensureResource({ moduleId: rCustomHooks.id, title: "Reusing Logic with Custom Hooks", url: "https://react.dev/learn/reusing-logic-with-custom-hooks", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rCustomHooks.id, title: "Custom Hooks Tutorial", url: "https://www.youtube.com/watch?v=6ThXsUwLWvc", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rCustomHooks.id, title: "useLocalStorage Hook", url: "https://usehooks.com/useLocalStorage/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "usehooks.com" });

    // Resources for Performance Essentials
    await ensureResource({ moduleId: rPerformance.id, title: "Memoizing in React", url: "https://react.dev/learn/you-might-not-need-an-effect#memoizing-results", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rPerformance.id, title: "React Performance Optimization", url: "https://www.youtube.com/watch?v=0fZKAap5G4E", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rPerformance.id, title: "React.memo, useMemo, useCallback", url: "https://react.dev/reference/react/memo", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "react.dev" });

    // Resources for Error Handling & Boundaries
    await ensureResource({ moduleId: rErrorHandling.id, title: "Error Boundaries", url: "https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rErrorHandling.id, title: "Error Boundary Tutorial", url: "https://www.youtube.com/watch?v=2vJjJvxQJPo", type: "VIDEO", estMinutes: 18, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rErrorHandling.id, title: "React Error Handling Patterns", url: "https://kentcdodds.com/blog/use-react-error-boundary", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "kentcdodds.com" });

    // Resources for Routing with React Router
    await ensureResource({ moduleId: rRouting.id, title: "React Router — Quick Start", url: "https://reactrouter.com/en/main/start/tutorial", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "reactrouter.com" });
    await ensureResource({ moduleId: rRouting.id, title: "React Router Tutorial", url: "https://www.youtube.com/watch?v=Ul3y1LXxzdU", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rRouting.id, title: "Route Parameters", url: "https://reactrouter.com/en/main/route/route", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "reactrouter.com" });

    // Resources for Styling Options
    await ensureResource({ moduleId: rStyling.id, title: "CSS Modules", url: "https://github.com/css-modules/css-modules", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: rStyling.id, title: "Tailwind CSS with React", url: "https://tailwindcss.com/docs/guides/create-react-app", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "tailwindcss.com" });
    await ensureResource({ moduleId: rStyling.id, title: "Styled Components", url: "https://styled-components.com/docs/basics", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "styled-components.com" });

    // Resources for Accessibility (a11y)
    await ensureResource({ moduleId: rAccessibility.id, title: "Accessible React Components", url: "https://react.dev/learn/accessibility", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rAccessibility.id, title: "React Accessibility Tutorial", url: "https://www.youtube.com/watch?v=dD56C5UNEG8", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rAccessibility.id, title: "ARIA in React", url: "https://react.dev/learn/accessibility#aria", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react.dev" });

    // Resources for Testing React
    await ensureResource({ moduleId: rTesting.id, title: "Testing Library — React", url: "https://testing-library.com/docs/react-testing-library/intro/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "testing-library.com" });
    await ensureResource({ moduleId: rTesting.id, title: "React Testing Tutorial", url: "https://www.youtube.com/watch?v=GLSSRtnNY0g", type: "VIDEO", estMinutes: 30, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rTesting.id, title: "Jest with React", url: "https://jestjs.io/docs/tutorial-react", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "jestjs.io" });

    // Resources for Async Patterns & Suspense (Client)
    await ensureResource({ moduleId: rAsyncPatterns.id, title: "Suspense for Data Fetching", url: "https://react.dev/reference/react/Suspense", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rAsyncPatterns.id, title: "useTransition Hook", url: "https://react.dev/reference/react/useTransition", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "react.dev" });
    await ensureResource({ moduleId: rAsyncPatterns.id, title: "React Suspense Tutorial", url: "https://www.youtube.com/watch?v=7LmrAU2qZnM", type: "VIDEO", estMinutes: 18, isFree: true, sourceDomain: "youtube.com" });

    // Resources for State Management Beyond React
    await ensureResource({ moduleId: rStateManagement.id, title: "Redux Toolkit", url: "https://redux-toolkit.js.org/introduction/getting-started", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "redux-toolkit.js.org" });
    await ensureResource({ moduleId: rStateManagement.id, title: "Zustand", url: "https://github.com/pmndrs/zustand", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: rStateManagement.id, title: "State Management Comparison", url: "https://www.youtube.com/watch?v=OJuRgUxSJdQ", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Forms at Scale
    await ensureResource({ moduleId: rFormsScale.id, title: "React Hook Form", url: "https://react-hook-form.com/get-started", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "react-hook-form.com" });
    await ensureResource({ moduleId: rFormsScale.id, title: "React Hook Form + Zod", url: "https://react-hook-form.com/docs/useform/validation", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "react-hook-form.com" });
    await ensureResource({ moduleId: rFormsScale.id, title: "Form Validation Tutorial", url: "https://www.youtube.com/watch?v=bU_eq8qyjic", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Animations & Micro-interactions
    await ensureResource({ moduleId: rAnimations.id, title: "Framer Motion", url: "https://www.framer.com/motion/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "framer.com" });
    await ensureResource({ moduleId: rAnimations.id, title: "Framer Motion Tutorial", url: "https://www.youtube.com/watch?v=2V1WK-3HQNk", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: rAnimations.id, title: "React Animation Patterns", url: "https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "react.dev" });

    // Resources for Next.js Essentials (App Router)
    await ensureResource({ moduleId: rNextJs.id, title: "Next.js App Router", url: "https://nextjs.org/docs/app", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "nextjs.org" });
    await ensureResource({ moduleId: rNextJs.id, title: "Server Components", url: "https://nextjs.org/docs/app/building-your-application/rendering/server-components", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "nextjs.org" });
    await ensureResource({ moduleId: rNextJs.id, title: "Next.js 13 Tutorial", url: "https://www.youtube.com/watch?v=__mSgDEOyv8", type: "VIDEO", estMinutes: 30, isFree: true, sourceDomain: "youtube.com" });

    // Resources for API Integration Patterns
    await ensureResource({ moduleId: rAPIIntegration.id, title: "TanStack Query", url: "https://tanstack.com/query/latest/docs/react/overview", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "tanstack.com" });
    await ensureResource({ moduleId: rAPIIntegration.id, title: "SWR", url: "https://swr.vercel.app/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "swr.vercel.app" });
    await ensureResource({ moduleId: rAPIIntegration.id, title: "API Integration Patterns", url: "https://www.youtube.com/watch?v=00RoZflFE34", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Production Build & Deploy
    await ensureResource({ moduleId: rProductionDeploy.id, title: "Vite Build", url: "https://vitejs.dev/guide/build.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "vitejs.dev" });
    await ensureResource({ moduleId: rProductionDeploy.id, title: "Deploy to Vercel", url: "https://vercel.com/docs/deployments", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "vercel.com" });
    await ensureResource({ moduleId: rProductionDeploy.id, title: "Deploy to Netlify", url: "https://docs.netlify.com/site-deploys/create-deploys/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "netlify.com" });

    // Resources for Advanced Component Patterns
    await ensureResource({ moduleId: rAdvancedPatterns.id, title: "Compound Components", url: "https://kentcdodds.com/blog/compound-components-with-react-hooks", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "kentcdodds.com" });
    await ensureResource({ moduleId: rAdvancedPatterns.id, title: "Headless UI", url: "https://headlessui.com/react/menu", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "headlessui.com" });
    await ensureResource({ moduleId: rAdvancedPatterns.id, title: "Advanced React Patterns", url: "https://www.youtube.com/watch?v=1H-Ye82lJdU", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });

    // Path: TypeScript for JS Devs
    const ts = await prisma.path.upsert({
        where: { slug: "typescript-for-js-devs" },
        update: { isPublished: true },
        create: {
            title: "TypeScript for JS Devs",
            slug: "typescript-for-js-devs",
            description: "Comprehensive TypeScript mastery: from basics to advanced patterns, tooling, and real-world applications.",
            isPublished: true,
        },
    });

    // Comprehensive TypeScript curriculum (25 modules)
    const tsGettingStarted = await ensureModule(ts.id, "Getting Started with TypeScript", 1, "Why TS, how it compiles to JS, installing Node + tsc, running ts-node");
    const tsTypeSystem = await ensureModule(ts.id, "The Type System Primer", 2, "Primitive types, any vs unknown, never, void, null/undefined");
    const tsObjectsArrays = await ensureModule(ts.id, "Objects, Arrays, Tuples & Enums", 3, "Object type literals, optional/readonly props, array types, tuples, enum/const enum");
    const tsFunctions = await ensureModule(ts.id, "Functions & Typing Behavior", 4, "Parameter/return types, default/optional params, overloads, rest args");
    const tsUnionsIntersections = await ensureModule(ts.id, "Unions, Intersections & Literal Types", 5, "Discriminated unions, tag fields, exact string/number literals, merging shapes");
    const tsTypeNarrowing = await ensureModule(ts.id, "Type Narrowing & Control Flow Analysis", 6, "typeof, in, instanceof, custom type predicates (arg is T)");
    const tsInterfaces = await ensureModule(ts.id, "Interfaces, Type Aliases & Declaration Merging", 7, "When to use each, extending vs intersection, ambient/declaration merging basics");
    const tsGenerics1 = await ensureModule(ts.id, "Generics I: The Basics", 8, "Generic functions, constraints (extends), default type params");
    const tsGenerics2 = await ensureModule(ts.id, "Generics II: Advanced Patterns", 9, "Higher-order generics, generic interfaces/classes, variance notes");
    const tsUtilityTypes = await ensureModule(ts.id, "Utility Types & Inference Power", 10, "Partial, Required, Pick, Omit, Record, Readonly, ReturnType, Parameters");
    const tsMappedTypes = await ensureModule(ts.id, "Mapped, Conditional & Template Literal Types", 11, "{ [K in Keys]: ... }, T extends U ? X : Y, string template types, key remapping");
    const tsModules = await ensureModule(ts.id, "Modules, tsconfig & Project Structure", 12, "ES modules vs CommonJS, path aliases, strict mode flags, resolveJsonModule, skipLibCheck");
    const tsClasses = await ensureModule(ts.id, "Classes, OOP & Composition in TS", 13, "private/protected, abstract, implements, composition vs inheritance");
    const tsAsync = await ensureModule(ts.id, "Async Code & Types", 14, "Promises, async/await, Promise.all, typed fetch, AbortController, error typing");
    const tsDOM = await ensureModule(ts.id, "DOM, JSX & React with TypeScript", 15, "DOM types, event types, generics in components, props/state, context, hooks typing, React.FC caveats");
    const tsNode = await ensureModule(ts.id, "Node.js with TypeScript", 16, "@types/*, ESM in Node, ts-node vs build step, Express/Fastify types, env typing");
    const tsThirdParty = await ensureModule(ts.id, "Third-Party Types & DefinitelyTyped", 17, "Installing @types, writing minimal ambient declarations *.d.ts, module augmentation");
    const tsTesting = await ensureModule(ts.id, "Testing & Tooling", 18, "Jest/Vitest + TS config, type-safe test helpers, ts-jest/SWC, coverage, CI basics");
    const tsLinting = await ensureModule(ts.id, "Linting, Formatting & DX", 19, "ESLint with @typescript-eslint, Prettier, strict rules that matter, noUncheckedIndexedAccess");
    const tsBuild = await ensureModule(ts.id, "Build Systems & Emission Targets", 20, "tsc emit options, source maps, bundlers (Vite/esbuild/Rspack), moduleResolution, target");
    const tsAPISchemas = await ensureModule(ts.id, "API Schemas & End-to-End Type Safety", 21, "Zod/Valibot for runtime validation + z.infer, OpenAPI → TS types, tRPC fundamentals");
    const tsAdvanced = await ensureModule(ts.id, "Advanced Patterns & \"Type-Level\" Tricks", 22, "satisfies operator, branded types, nominal typing, exhaustive checking, phantom types");
    const tsMonorepos = await ensureModule(ts.id, "Monorepos & Project References", 23, "pnpm workspaces, composite projects, references, shared type packages");
    const tsMigration = await ensureModule(ts.id, "Migration Playbook: JS → TS", 24, "Incremental typing, // @ts-check in JS, strictness ramp, dealing with anys strategically");
    const tsPatterns = await ensureModule(ts.id, "Design Patterns in TypeScript", 25, "Builder, Factory, Strategy, Observer with union types & generics; functional alternatives");

    // Resources for Getting Started with TypeScript
    await ensureResource({ moduleId: tsGettingStarted.id, title: "TypeScript in 5 Minutes", url: "https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsGettingStarted.id, title: "Why TypeScript?", url: "https://www.youtube.com/watch?v=ahCwqrYpIuM", type: "VIDEO", estMinutes: 8, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: tsGettingStarted.id, title: "Installing TypeScript", url: "https://www.typescriptlang.org/download", type: "DOC", estMinutes: 10, isFree: true, sourceDomain: "typescriptlang.org" });

    // Resources for The Type System Primer
    await ensureResource({ moduleId: tsTypeSystem.id, title: "Everyday Types", url: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsTypeSystem.id, title: "The 'any' Type", url: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#any", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsTypeSystem.id, title: "TypeScript: The 'unknown' Type", url: "https://mariusschulz.com/blog/typescript-2-0-the-unknown-type", type: "DOC", estMinutes: 12, isFree: true, sourceDomain: "mariusschulz.com" });

    // Resources for Objects, Arrays, Tuples & Enums
    await ensureResource({ moduleId: tsObjectsArrays.id, title: "Object Types", url: "https://www.typescriptlang.org/docs/handbook/2/objects.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsObjectsArrays.id, title: "Array Types", url: "https://www.typescriptlang.org/docs/handbook/2/objects.html#array-types", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsObjectsArrays.id, title: "Tuple Types", url: "https://www.typescriptlang.org/docs/handbook/2/objects.html#tuple-types", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsObjectsArrays.id, title: "Enums", url: "https://www.typescriptlang.org/docs/handbook/enums.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });

    // Resources for Functions & Typing Behavior
    await ensureResource({ moduleId: tsFunctions.id, title: "Functions", url: "https://www.typescriptlang.org/docs/handbook/2/functions.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsFunctions.id, title: "Function Overloads", url: "https://www.typescriptlang.org/docs/handbook/2/functions.html#function-overloads", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsFunctions.id, title: "Rest Parameters", url: "https://www.typescriptlang.org/docs/handbook/2/functions.html#rest-parameters", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "typescriptlang.org" });

    // Resources for Unions, Intersections & Literal Types
    await ensureResource({ moduleId: tsUnionsIntersections.id, title: "Union Types", url: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#union-types", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsUnionsIntersections.id, title: "Intersection Types", url: "https://www.typescriptlang.org/docs/handbook/2/objects.html#intersection-types", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsUnionsIntersections.id, title: "Literal Types", url: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#literal-types", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "typescriptlang.org" });

    // Resources for Type Narrowing & Control Flow Analysis
    await ensureResource({ moduleId: tsTypeNarrowing.id, title: "Narrowing", url: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsTypeNarrowing.id, title: "Type Guards", url: "https://www.typescriptlang.org/docs/handbook/2/narrowing.html#using-type-predicates", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsTypeNarrowing.id, title: "TypeScript Type Guards Explained", url: "https://www.youtube.com/watch?v=7bmt2jwa85E", type: "VIDEO", estMinutes: 12, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Interfaces, Type Aliases & Declaration Merging
    await ensureResource({ moduleId: tsInterfaces.id, title: "Interfaces", url: "https://www.typescriptlang.org/docs/handbook/2/objects.html#interfaces", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsInterfaces.id, title: "Type Aliases", url: "https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-aliases", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsInterfaces.id, title: "Declaration Merging", url: "https://www.typescriptlang.org/docs/handbook/declaration-merging.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });

    // Resources for Generics I: The Basics
    await ensureResource({ moduleId: tsGenerics1.id, title: "Generics", url: "https://www.typescriptlang.org/docs/handbook/2/generics.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsGenerics1.id, title: "Generic Constraints", url: "https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-constraints", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsGenerics1.id, title: "TypeScript Generics Tutorial", url: "https://www.youtube.com/watch?v=nViEqpgwxHE", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Generics II: Advanced Patterns
    await ensureResource({ moduleId: tsGenerics2.id, title: "Generic Classes", url: "https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-classes", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsGenerics2.id, title: "Generic Interfaces", url: "https://www.typescriptlang.org/docs/handbook/2/generics.html#generic-interfaces", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsGenerics2.id, title: "Advanced TypeScript Generics", url: "https://www.youtube.com/watch?v=3dw4wKuqs6U", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Utility Types & Inference Power
    await ensureResource({ moduleId: tsUtilityTypes.id, title: "Utility Types", url: "https://www.typescriptlang.org/docs/handbook/utility-types.html", type: "DOC", estMinutes: 40, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsUtilityTypes.id, title: "Type Inference", url: "https://www.typescriptlang.org/docs/handbook/type-inference.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsUtilityTypes.id, title: "TypeScript Utility Types Explained", url: "https://www.youtube.com/watch?v=7_8OtTfkoTA", type: "VIDEO", estMinutes: 18, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Mapped, Conditional & Template Literal Types
    await ensureResource({ moduleId: tsMappedTypes.id, title: "Mapped Types", url: "https://www.typescriptlang.org/docs/handbook/2/mapped-types.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsMappedTypes.id, title: "Conditional Types", url: "https://www.typescriptlang.org/docs/handbook/2/conditional-types.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsMappedTypes.id, title: "Template Literal Types", url: "https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });

    // Resources for Modules, tsconfig & Project Structure
    await ensureResource({ moduleId: tsModules.id, title: "Modules", url: "https://www.typescriptlang.org/docs/handbook/2/modules.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsModules.id, title: "tsconfig Reference", url: "https://www.typescriptlang.org/tsconfig", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsModules.id, title: "TypeScript Project Structure Best Practices", url: "https://www.youtube.com/watch?v=9U8Z9TG6aqA", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Classes, OOP & Composition in TS
    await ensureResource({ moduleId: tsClasses.id, title: "Classes", url: "https://www.typescriptlang.org/docs/handbook/2/classes.html", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsClasses.id, title: "Abstract Classes", url: "https://www.typescriptlang.org/docs/handbook/2/classes.html#abstract-classes", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsClasses.id, title: "TypeScript Classes Tutorial", url: "https://www.youtube.com/watch?v=Zchgoj_8LxU", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Async Code & Types
    await ensureResource({ moduleId: tsAsync.id, title: "Async Functions", url: "https://www.typescriptlang.org/docs/handbook/2/functions.html#async-functions", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsAsync.id, title: "Promise Types", url: "https://www.typescriptlang.org/docs/handbook/2/objects.html#promise-types", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsAsync.id, title: "TypeScript Async/Await Tutorial", url: "https://www.youtube.com/watch?v=W6NZfCO5SIk", type: "VIDEO", estMinutes: 12, isFree: true, sourceDomain: "youtube.com" });

    // Resources for DOM, JSX & React with TypeScript
    await ensureResource({ moduleId: tsDOM.id, title: "React + TypeScript Cheatsheets", url: "https://react-typescript-cheatsheet.netlify.app/docs/basic/setup/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "react-typescript-cheatsheet.netlify.app" });
    await ensureResource({ moduleId: tsDOM.id, title: "TypeScript with React Tutorial", url: "https://www.youtube.com/watch?v=F2JCjVSZlG0", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: tsDOM.id, title: "DOM Types in TypeScript", url: "https://www.typescriptlang.org/docs/handbook/dom-manipulation.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });

    // Resources for Node.js with TypeScript
    await ensureResource({ moduleId: tsNode.id, title: "Node.js with TypeScript", url: "https://nodejs.org/en/docs/guides/typescript/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "nodejs.org" });
    await ensureResource({ moduleId: tsNode.id, title: "Express with TypeScript", url: "https://expressjs.com/en/guide/using-middleware.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "expressjs.com" });
    await ensureResource({ moduleId: tsNode.id, title: "TypeScript Node.js Setup", url: "https://www.youtube.com/watch?v=H91aqUHn8sE", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Third-Party Types & DefinitelyTyped
    await ensureResource({ moduleId: tsThirdParty.id, title: "DefinitelyTyped", url: "https://github.com/DefinitelyTyped/DefinitelyTyped", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: tsThirdParty.id, title: "Writing Declaration Files", url: "https://www.typescriptlang.org/docs/handbook/declaration-files/introduction.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsThirdParty.id, title: "Module Augmentation", url: "https://www.typescriptlang.org/docs/handbook/declaration-merging.html#module-augmentation", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });

    // Resources for Testing & Tooling
    await ensureResource({ moduleId: tsTesting.id, title: "Jest with TypeScript", url: "https://jestjs.io/docs/getting-started#using-typescript", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "jestjs.io" });
    await ensureResource({ moduleId: tsTesting.id, title: "Vitest with TypeScript", url: "https://vitest.dev/guide/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "vitest.dev" });
    await ensureResource({ moduleId: tsTesting.id, title: "TypeScript Testing Best Practices", url: "https://www.youtube.com/watch?v=rk6G8TtdbQY", type: "VIDEO", estMinutes: 18, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Linting, Formatting & DX
    await ensureResource({ moduleId: tsLinting.id, title: "ESLint with TypeScript", url: "https://typescript-eslint.io/getting-started/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "typescript-eslint.io" });
    await ensureResource({ moduleId: tsLinting.id, title: "Prettier with TypeScript", url: "https://prettier.io/docs/en/options.html", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "prettier.io" });
    await ensureResource({ moduleId: tsLinting.id, title: "TypeScript ESLint Rules", url: "https://typescript-eslint.io/rules/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescript-eslint.io" });

    // Resources for Build Systems & Emission Targets
    await ensureResource({ moduleId: tsBuild.id, title: "TypeScript Compiler Options", url: "https://www.typescriptlang.org/tsconfig", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsBuild.id, title: "Vite with TypeScript", url: "https://vitejs.dev/guide/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "vitejs.dev" });
    await ensureResource({ moduleId: tsBuild.id, title: "Webpack with TypeScript", url: "https://webpack.js.org/guides/typescript/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "webpack.js.org" });

    // Resources for API Schemas & End-to-End Type Safety
    await ensureResource({ moduleId: tsAPISchemas.id, title: "Zod Documentation", url: "https://zod.dev/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "zod.dev" });
    await ensureResource({ moduleId: tsAPISchemas.id, title: "tRPC Documentation", url: "https://trpc.io/docs", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "trpc.io" });
    await ensureResource({ moduleId: tsAPISchemas.id, title: "TypeScript API Validation", url: "https://www.youtube.com/watch?v=L6BE-U3oy80", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Advanced Patterns & "Type-Level" Tricks
    await ensureResource({ moduleId: tsAdvanced.id, title: "The 'satisfies' Operator", url: "https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-9.html#the-satisfies-operator", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsAdvanced.id, title: "Branded Types", url: "https://michalzalecki.com/nominal-typing-in-typescript/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "michalzalecki.com" });
    await ensureResource({ moduleId: tsAdvanced.id, title: "Advanced TypeScript Patterns", url: "https://www.youtube.com/watch?v=KbFlZYCpONw", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Monorepos & Project References
    await ensureResource({ moduleId: tsMonorepos.id, title: "TypeScript Project References", url: "https://www.typescriptlang.org/docs/handbook/project-references.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsMonorepos.id, title: "pnpm Workspaces", url: "https://pnpm.io/workspaces", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "pnpm.io" });
    await ensureResource({ moduleId: tsMonorepos.id, title: "Monorepo with TypeScript", url: "https://www.youtube.com/watch?v=0P7mXa5bq4Y", type: "VIDEO", estMinutes: 18, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Migration Playbook: JS → TS
    await ensureResource({ moduleId: tsMigration.id, title: "Migrating from JavaScript", url: "https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "typescriptlang.org" });
    await ensureResource({ moduleId: tsMigration.id, title: "Incremental TypeScript Migration", url: "https://www.youtube.com/watch?v=QOvoVFL2RVA", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: tsMigration.id, title: "TypeScript Migration Strategies", url: "https://blog.logrocket.com/migrating-javascript-typescript/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "blog.logrocket.com" });

    // Resources for Design Patterns in TypeScript
    await ensureResource({ moduleId: tsPatterns.id, title: "Design Patterns in TypeScript", url: "https://refactoring.guru/design-patterns/typescript", type: "DOC", estMinutes: 40, isFree: true, sourceDomain: "refactoring.guru" });
    await ensureResource({ moduleId: tsPatterns.id, title: "TypeScript Design Patterns", url: "https://www.youtube.com/watch?v=NU_1StN5Tkk", type: "VIDEO", estMinutes: 30, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: tsPatterns.id, title: "Functional Programming in TypeScript", url: "https://www.youtube.com/watch?v=BMUiFMZr7vk", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });

    // Path: DevOps Foundations
    const devops = await prisma.path.upsert({
        where: { slug: "devops-foundations" },
        update: { isPublished: true },
        create: {
            title: "DevOps Foundations",
            slug: "devops-foundations",
            description: "Comprehensive DevOps mastery: from culture and automation to cloud infrastructure and modern deployment practices.",
            isPublished: true,
        },
    });

    // Comprehensive DevOps curriculum (15 modules)
    const dIntro = await ensureModule(devops.id, "Introduction to DevOps", 1, "What DevOps is, culture (Dev + Ops), Agile/CI/CD, automation, \"you build it, you run it\"");
    const dLinuxShell = await ensureModule(devops.id, "Linux & Shell Fundamentals", 2, "Linux basics, file system navigation, permissions, processes, signals, scripting");
    const dGit = await ensureModule(devops.id, "Git & Version Control", 3, "Git basics (clone, commit, push, branch, merge), GitHub/GitLab flows");
    const dNetworking = await ensureModule(devops.id, "Networking Basics for DevOps", 4, "DNS, TCP/IP, ports, HTTP/HTTPS, load balancing, firewalls, VPNs");
    const dVirtualization = await ensureModule(devops.id, "Virtualization & Containers", 5, "VMs vs containers, Docker basics, images/layers, Dockerfile, volumes, networking");
    const dCICD = await ensureModule(devops.id, "CI/CD Essentials", 6, "Pipelines, stages, artifacts, triggers, rollback, GitHub Actions, GitLab CI, Jenkins");
    const dIaC = await ensureModule(devops.id, "Infrastructure as Code (IaC)", 7, "Idempotency, declarative vs imperative, drift detection, Terraform basics, CloudFormation");
    const dConfigMgmt = await ensureModule(devops.id, "Configuration Management", 8, "Desired state vs imperative scripts, Ansible, Puppet, Chef basics");
    const dCloud = await ensureModule(devops.id, "Cloud Foundations", 9, "IaaS, PaaS, SaaS, regions/zones, elasticity, AWS/GCP/Azure basics");
    const dOrchestration = await ensureModule(devops.id, "Orchestration & Scaling", 10, "Why orchestration, service discovery, rolling updates, Kubernetes basics");
    const dObservability = await ensureModule(devops.id, "Observability & Monitoring", 11, "Logs, metrics, traces, SLOs, SLIs, SLAs, Prometheus, Grafana, ELK stack");
    const dSecurity = await ensureModule(devops.id, "Security & Secrets Management", 12, "Principle of least privilege, secrets rotation, TLS basics, Vault, KMS, Trivy");
    const dTesting = await ensureModule(devops.id, "Testing in DevOps", 13, "Unit, integration, smoke, canary testing in pipelines, Jest/pytest + CI hooks");
    const dSRE = await ensureModule(devops.id, "Site Reliability Engineering (SRE) Principles", 14, "Error budgets, blameless postmortems, toil reduction");
    const dGitOps = await ensureModule(devops.id, "GitOps & Modern DevOps", 15, "GitOps workflows, infra changes via PR, ArgoCD/FluxCD basics");

    // Resources for Introduction to DevOps
    await ensureResource({ moduleId: dIntro.id, title: "What is DevOps?", url: "https://aws.amazon.com/devops/what-is-devops/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: dIntro.id, title: "DevOps Culture and Practices", url: "https://www.atlassian.com/devops", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "atlassian.com" });
    await ensureResource({ moduleId: dIntro.id, title: "DevOps Tutorial for Beginners", url: "https://www.youtube.com/watch?v=9pZ2xmsSDdo", type: "VIDEO", estMinutes: 30, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Linux & Shell Fundamentals
    await ensureResource({ moduleId: dLinuxShell.id, title: "Linux Command Line Tutorial", url: "https://www.youtube.com/watch?v=YHFzr-akOas", type: "VIDEO", estMinutes: 45, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: dLinuxShell.id, title: "Bash Scripting Tutorial", url: "https://www.shellscript.sh/", type: "DOC", estMinutes: 60, isFree: true, sourceDomain: "shellscript.sh" });
    await ensureResource({ moduleId: dLinuxShell.id, title: "Linux File Permissions", url: "https://www.guru99.com/file-permissions.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "guru99.com" });

    // Resources for Git & Version Control
    await ensureResource({ moduleId: dGit.id, title: "Pro Git (Ch. 1-2)", url: "https://git-scm.com/book/en/v2", type: "DOC", estMinutes: 60, isFree: true, sourceDomain: "git-scm.com" });
    await ensureResource({ moduleId: dGit.id, title: "GitHub Flow", url: "https://docs.github.com/en/get-started/quickstart/github-flow", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: dGit.id, title: "Git Tutorial for Beginners", url: "https://www.youtube.com/watch?v=8JJ101D3knE", type: "VIDEO", estMinutes: 35, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Networking Basics for DevOps
    await ensureResource({ moduleId: dNetworking.id, title: "Networking Fundamentals", url: "https://www.youtube.com/watch?v=qiQR5rTSshw", type: "VIDEO", estMinutes: 40, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: dNetworking.id, title: "DNS Explained", url: "https://www.cloudflare.com/learning/dns/what-is-dns/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "cloudflare.com" });
    await ensureResource({ moduleId: dNetworking.id, title: "HTTP/HTTPS Basics", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "developer.mozilla.org" });

    // Resources for Virtualization & Containers
    await ensureResource({ moduleId: dVirtualization.id, title: "Docker — Get Started", url: "https://docs.docker.com/get-started/", type: "DOC", estMinutes: 45, isFree: true, sourceDomain: "docker.com" });
    await ensureResource({ moduleId: dVirtualization.id, title: "Docker Tutorial for Beginners", url: "https://www.youtube.com/watch?v=3c-iBn73dDE", type: "VIDEO", estMinutes: 50, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: dVirtualization.id, title: "Dockerfile Best Practices", url: "https://docs.docker.com/develop/dev-best-practices/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "docker.com" });

    // Resources for CI/CD Essentials
    await ensureResource({ moduleId: dCICD.id, title: "Understanding GitHub Actions", url: "https://docs.github.com/actions/learn-github-actions/understanding-github-actions", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "github.com" });
    await ensureResource({ moduleId: dCICD.id, title: "GitLab CI/CD Tutorial", url: "https://docs.gitlab.com/ee/ci/", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "gitlab.com" });
    await ensureResource({ moduleId: dCICD.id, title: "Jenkins Tutorial", url: "https://www.youtube.com/watch?v=LFDrDnKPOTg", type: "VIDEO", estMinutes: 40, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Infrastructure as Code (IaC)
    await ensureResource({ moduleId: dIaC.id, title: "Terraform — Getting Started", url: "https://developer.hashicorp.com/terraform/tutorials/aws-get-started", type: "DOC", estMinutes: 45, isFree: true, sourceDomain: "developer.hashicorp.com" });
    await ensureResource({ moduleId: dIaC.id, title: "Terraform Tutorial", url: "https://www.youtube.com/watch?v=SLB_c_ayRMo", type: "VIDEO", estMinutes: 50, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: dIaC.id, title: "AWS CloudFormation", url: "https://docs.aws.amazon.com/cloudformation/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });

    // Resources for Configuration Management
    await ensureResource({ moduleId: dConfigMgmt.id, title: "Ansible Tutorial", url: "https://docs.ansible.com/ansible/latest/getting_started/index.html", type: "DOC", estMinutes: 40, isFree: true, sourceDomain: "ansible.com" });
    await ensureResource({ moduleId: dConfigMgmt.id, title: "Ansible for DevOps", url: "https://www.youtube.com/watch?v=goclfp6a2IQ", type: "VIDEO", estMinutes: 45, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: dConfigMgmt.id, title: "Puppet vs Ansible vs Chef", url: "https://www.guru99.com/ansible-vs-puppet-vs-chef.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "guru99.com" });

    // Resources for Cloud Foundations
    await ensureResource({ moduleId: dCloud.id, title: "AWS Fundamentals", url: "https://aws.amazon.com/getting-started/fundamentals-core-concepts/", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: dCloud.id, title: "Google Cloud Fundamentals", url: "https://cloud.google.com/docs/get-started", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: dCloud.id, title: "Azure Fundamentals", url: "https://docs.microsoft.com/en-us/learn/paths/azure-fundamentals/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Orchestration & Scaling
    await ensureResource({ moduleId: dOrchestration.id, title: "Kubernetes Basics", url: "https://kubernetes.io/docs/tutorials/kubernetes-basics/", type: "DOC", estMinutes: 50, isFree: true, sourceDomain: "kubernetes.io" });
    await ensureResource({ moduleId: dOrchestration.id, title: "Kubernetes Tutorial", url: "https://www.youtube.com/watch?v=s_o8dwV2m5Y", type: "VIDEO", estMinutes: 55, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: dOrchestration.id, title: "Minikube Getting Started", url: "https://minikube.sigs.k8s.io/docs/start/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "minikube.sigs.k8s.io" });

    // Resources for Observability & Monitoring
    await ensureResource({ moduleId: dObservability.id, title: "Prometheus Getting Started", url: "https://prometheus.io/docs/prometheus/latest/getting_started/", type: "DOC", estMinutes: 40, isFree: true, sourceDomain: "prometheus.io" });
    await ensureResource({ moduleId: dObservability.id, title: "Grafana Tutorial", url: "https://grafana.com/docs/grafana/latest/getting-started/getting-started/", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "grafana.com" });
    await ensureResource({ moduleId: dObservability.id, title: "ELK Stack Tutorial", url: "https://www.youtube.com/watch?v=4X0WLg05Aww", type: "VIDEO", estMinutes: 45, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Security & Secrets Management
    await ensureResource({ moduleId: dSecurity.id, title: "HashiCorp Vault", url: "https://developer.hashicorp.com/vault/docs/what-is-vault", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "developer.hashicorp.com" });
    await ensureResource({ moduleId: dSecurity.id, title: "Trivy Vulnerability Scanner", url: "https://aquasecurity.github.io/trivy/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "aquasecurity.github.io" });
    await ensureResource({ moduleId: dSecurity.id, title: "DevOps Security Best Practices", url: "https://www.youtube.com/watch?v=7K4VAhBEQyI", type: "VIDEO", estMinutes: 35, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Testing in DevOps
    await ensureResource({ moduleId: dTesting.id, title: "Testing in CI/CD Pipelines", url: "https://www.atlassian.com/continuous-delivery/principles/testing-automation", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "atlassian.com" });
    await ensureResource({ moduleId: dTesting.id, title: "Jest Testing Framework", url: "https://jestjs.io/docs/getting-started", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "jestjs.io" });
    await ensureResource({ moduleId: dTesting.id, title: "PyTest Tutorial", url: "https://docs.pytest.org/en/stable/getting-started.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "pytest.org" });

    // Resources for Site Reliability Engineering (SRE) Principles
    await ensureResource({ moduleId: dSRE.id, title: "Google SRE Book", url: "https://sre.google/sre-book/table-of-contents/", type: "DOC", estMinutes: 60, isFree: true, sourceDomain: "sre.google" });
    await ensureResource({ moduleId: dSRE.id, title: "SRE vs DevOps", url: "https://www.atlassian.com/devops/devops-tools/sre-vs-devops", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "atlassian.com" });
    await ensureResource({ moduleId: dSRE.id, title: "SRE Principles Tutorial", url: "https://www.youtube.com/watch?v=uTEL8Ff1Zvk", type: "VIDEO", estMinutes: 40, isFree: true, sourceDomain: "youtube.com" });

    // Resources for GitOps & Modern DevOps
    await ensureResource({ moduleId: dGitOps.id, title: "GitOps Principles", url: "https://www.gitops.tech/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "gitops.tech" });
    await ensureResource({ moduleId: dGitOps.id, title: "ArgoCD Tutorial", url: "https://argo-cd.readthedocs.io/en/stable/getting_started/", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "argo-cd.readthedocs.io" });
    await ensureResource({ moduleId: dGitOps.id, title: "FluxCD Getting Started", url: "https://fluxcd.io/docs/get-started/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "fluxcd.io" });

    // Path: Algorithms & Data Structures
    const algos = await prisma.path.upsert({
        where: { slug: "algorithms-and-data-structures" },
        update: { isPublished: true },
        create: {
            title: "Algorithms & Data Structures",
            slug: "algorithms-and-data-structures",
            description: "Comprehensive algorithms and data structures mastery: from complexity analysis to advanced problem-solving strategies.",
            isPublished: true,
        },
    });

    // Comprehensive Algorithms & Data Structures curriculum (19 modules)
    const aComplexity = await ensureModule(algos.id, "Foundations: Complexity Analysis", 1, "Big-O, Big-Θ, Big-Ω, constant vs log vs linear vs quadratic growth");
    const aArraysStrings = await ensureModule(algos.id, "Arrays & Strings", 2, "Access, insert/delete operations, search strategies");
    const aRecursionDivide = await ensureModule(algos.id, "Recursion & Divide & Conquer", 3, "Binary search, merge sort, quicksort algorithms");
    const aLinkedLists = await ensureModule(algos.id, "Linked Lists", 4, "Singly vs doubly linked lists, operations and implementations");
    const aStacksQueues = await ensureModule(algos.id, "Stacks & Queues", 5, "Stack and queue operations, deque, sliding window techniques");
    const aHashing = await ensureModule(algos.id, "Hashing", 6, "Hash tables, collision resolution, average vs worst case complexity");
    const aTreesBasics = await ensureModule(algos.id, "Trees (Basics)", 7, "Binary Search Trees, search/insert/delete operations, traversals");
    const aTreesAdvanced = await ensureModule(algos.id, "Trees (Advanced)", 8, "Balanced trees (AVL, Red-Black), heaps, tries");
    const aGraphsBasics = await ensureModule(algos.id, "Graphs (Basics)", 9, "Graph representations, DFS/BFS, adjacency list vs matrix");
    const aGraphsAdvanced = await ensureModule(algos.id, "Graphs (Advanced)", 10, "Shortest path algorithms, MST, topological sort");
    const aGreedy = await ensureModule(algos.id, "Greedy Algorithms", 11, "Activity selection, Huffman coding, interval scheduling");
    const aDPIntro = await ensureModule(algos.id, "Dynamic Programming (Intro)", 12, "Fibonacci DP, climbing stairs, house robber problems");
    const aDPAdvanced = await ensureModule(algos.id, "Dynamic Programming (Advanced)", 13, "Knapsack, LCS, edit distance, word break");
    const aAdvancedGraphDP = await ensureModule(algos.id, "Advanced Graph & DP", 14, "Floyd-Warshall, bitmask DP, tree DP");
    const aMathBitManipulation = await ensureModule(algos.id, "Math & Bit Manipulation", 15, "GCD, Sieve of Eratosthenes, bit tricks");
    const aAdvancedDataStructures = await ensureModule(algos.id, "Advanced Data Structures", 16, "Segment trees, Fenwick trees, disjoint sets");
    const aStringsPatternMatching = await ensureModule(algos.id, "Strings & Pattern Matching", 17, "Naive search, KMP, Rabin-Karp algorithms");
    const aGeometry = await ensureModule(algos.id, "Geometry & Other Topics", 18, "Convex hull, closest pair algorithms");
    const aProblemSolving = await ensureModule(algos.id, "Problem Solving Strategies", 19, "Sliding window, two pointers, backtracking");

    // Resources for Foundations: Complexity Analysis
    await ensureResource({ moduleId: aComplexity.id, title: "Big-O Cheat Sheet", url: "https://www.bigocheatsheet.com/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "bigocheatsheet.com" });
    await ensureResource({ moduleId: aComplexity.id, title: "Big O Notation Tutorial", url: "https://www.youtube.com/watch?v=D6xkbGLQesk", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: aComplexity.id, title: "Time Complexity Analysis", url: "https://cp-algorithms.com/complexity.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cp-algorithms.com" });

    // Resources for Arrays & Strings
    await ensureResource({ moduleId: aArraysStrings.id, title: "Arrays Data Structure", url: "https://www.geeksforgeeks.org/array-data-structure/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aArraysStrings.id, title: "Two Sum Problem", url: "https://leetcode.com/problems/two-sum/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aArraysStrings.id, title: "Array Operations Tutorial", url: "https://www.youtube.com/watch?v=QJ1qKxwU4W4", type: "VIDEO", estMinutes: 18, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Recursion & Divide & Conquer
    await ensureResource({ moduleId: aRecursionDivide.id, title: "Recursion Tutorial", url: "https://www.geeksforgeeks.org/recursion/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aRecursionDivide.id, title: "Merge Sort Algorithm", url: "https://www.geeksforgeeks.org/merge-sort/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aRecursionDivide.id, title: "Quick Sort Algorithm", url: "https://www.geeksforgeeks.org/quick-sort/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "geeksforgeeks.org" });

    // Resources for Linked Lists
    await ensureResource({ moduleId: aLinkedLists.id, title: "Linked Lists — VisuAlgo", url: "https://visualgo.net/en/list", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "visualgo.net" });
    await ensureResource({ moduleId: aLinkedLists.id, title: "Reverse Linked List", url: "https://leetcode.com/problems/reverse-linked-list/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aLinkedLists.id, title: "Linked List Tutorial", url: "https://www.youtube.com/watch?v=R9PTBwOzceo", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Stacks & Queues
    await ensureResource({ moduleId: aStacksQueues.id, title: "Stacks & Queues — Visual", url: "https://visualgo.net/en/stack", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "visualgo.net" });
    await ensureResource({ moduleId: aStacksQueues.id, title: "Sliding Window Maximum", url: "https://leetcode.com/problems/sliding-window-maximum/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aStacksQueues.id, title: "Stack and Queue Tutorial", url: "https://www.youtube.com/watch?v=wjI1WNcIntg", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Hashing
    await ensureResource({ moduleId: aHashing.id, title: "Hash Tables — Visual Guide", url: "https://www.youtube.com/watch?v=shs0KM3wKv8", type: "VIDEO", estMinutes: 15, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: aHashing.id, title: "Subarray Sum Equals K", url: "https://leetcode.com/problems/subarray-sum-equals-k/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aHashing.id, title: "Hash Table Implementation", url: "https://www.geeksforgeeks.org/implementing-our-own-hash-table-with-separate-chaining-in-java/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "geeksforgeeks.org" });

    // Resources for Trees (Basics)
    await ensureResource({ moduleId: aTreesBasics.id, title: "Tree Traversals — VisuAlgo", url: "https://visualgo.net/en/bst", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "visualgo.net" });
    await ensureResource({ moduleId: aTreesBasics.id, title: "Serialize and Deserialize Binary Tree", url: "https://leetcode.com/problems/serialize-and-deserialize-binary-tree/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aTreesBasics.id, title: "Binary Search Tree Tutorial", url: "https://www.youtube.com/watch?v=oSWTXtMglKE", type: "VIDEO", estMinutes: 20, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Trees (Advanced)
    await ensureResource({ moduleId: aTreesAdvanced.id, title: "AVL Tree Tutorial", url: "https://www.geeksforgeeks.org/avl-tree-set-1-insertion/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aTreesAdvanced.id, title: "Heap Data Structure", url: "https://www.geeksforgeeks.org/heap-data-structure/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aTreesAdvanced.id, title: "Trie Data Structure", url: "https://www.geeksforgeeks.org/trie-insert-and-search/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "geeksforgeeks.org" });

    // Resources for Graphs (Basics)
    await ensureResource({ moduleId: aGraphsBasics.id, title: "Graphs — BFS/DFS", url: "https://cp-algorithms.com/graph/breadth-first-search.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aGraphsBasics.id, title: "Number of Islands", url: "https://leetcode.com/problems/number-of-islands/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aGraphsBasics.id, title: "Graph Traversal Tutorial", url: "https://www.youtube.com/watch?v=pcKY4hjDrxk", type: "VIDEO", estMinutes: 22, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Graphs (Advanced)
    await ensureResource({ moduleId: aGraphsAdvanced.id, title: "Dijkstra's Algorithm", url: "https://cp-algorithms.com/graph/dijkstra.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aGraphsAdvanced.id, title: "Course Schedule", url: "https://leetcode.com/problems/course-schedule/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aGraphsAdvanced.id, title: "Shortest Path Algorithms", url: "https://www.youtube.com/watch?v=EFg3u_E6eHU", type: "VIDEO", estMinutes: 28, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Greedy Algorithms
    await ensureResource({ moduleId: aGreedy.id, title: "Activity Selection Problem", url: "https://www.geeksforgeeks.org/activity-selection-problem-greedy-algo-1/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aGreedy.id, title: "Jump Game", url: "https://leetcode.com/problems/jump-game/", type: "DOC", estMinutes: 15, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aGreedy.id, title: "Greedy Algorithms Tutorial", url: "https://www.youtube.com/watch?v=HzeK7g8cD0Y", type: "VIDEO", estMinutes: 18, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Dynamic Programming (Intro)
    await ensureResource({ moduleId: aDPIntro.id, title: "DP — Memoization vs Tabulation", url: "https://www.youtube.com/watch?v=oBt53YbR9Kk", type: "VIDEO", estMinutes: 60, isFree: true, sourceDomain: "youtube.com" });
    await ensureResource({ moduleId: aDPIntro.id, title: "Coin Change", url: "https://leetcode.com/problems/coin-change/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aDPIntro.id, title: "Dynamic Programming Basics", url: "https://www.geeksforgeeks.org/dynamic-programming/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "geeksforgeeks.org" });

    // Resources for Dynamic Programming (Advanced)
    await ensureResource({ moduleId: aDPAdvanced.id, title: "0/1 Knapsack Problem", url: "https://www.geeksforgeeks.org/0-1-knapsack-problem-dp-10/", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aDPAdvanced.id, title: "Longest Common Subsequence", url: "https://leetcode.com/problems/longest-common-subsequence/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "leetcode.com" });
    await ensureResource({ moduleId: aDPAdvanced.id, title: "Word Break Problem", url: "https://leetcode.com/problems/word-break/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "leetcode.com" });

    // Resources for Advanced Graph & DP
    await ensureResource({ moduleId: aAdvancedGraphDP.id, title: "Floyd-Warshall Algorithm", url: "https://cp-algorithms.com/graph/all-pair-shortest-path-floyd-warshall.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aAdvancedGraphDP.id, title: "Traveling Salesman Problem", url: "https://www.geeksforgeeks.org/traveling-salesman-problem-tsp-implementation/", type: "DOC", estMinutes: 40, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aAdvancedGraphDP.id, title: "Bitmask DP Tutorial", url: "https://www.youtube.com/watch?v=7H-Ye82lJdU", type: "VIDEO", estMinutes: 35, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Math & Bit Manipulation
    await ensureResource({ moduleId: aMathBitManipulation.id, title: "Euclidean Algorithm", url: "https://cp-algorithms.com/algebra/euclid-algorithm.html", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aMathBitManipulation.id, title: "Sieve of Eratosthenes", url: "https://cp-algorithms.com/algebra/sieve-of-eratosthenes.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aMathBitManipulation.id, title: "Bit Manipulation Tricks", url: "https://www.geeksforgeeks.org/bit-tricks-competitive-programming/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "geeksforgeeks.org" });

    // Resources for Advanced Data Structures
    await ensureResource({ moduleId: aAdvancedDataStructures.id, title: "Segment Tree", url: "https://cp-algorithms.com/data_structures/segment_tree.html", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aAdvancedDataStructures.id, title: "Fenwick Tree", url: "https://cp-algorithms.com/data_structures/fenwick.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aAdvancedDataStructures.id, title: "Disjoint Set Union", url: "https://cp-algorithms.com/data_structures/disjoint_set_union.html", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cp-algorithms.com" });

    // Resources for Strings & Pattern Matching
    await ensureResource({ moduleId: aStringsPatternMatching.id, title: "KMP Algorithm", url: "https://cp-algorithms.com/string/prefix-function.html", type: "DOC", estMinutes: 40, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aStringsPatternMatching.id, title: "Rabin-Karp Algorithm", url: "https://cp-algorithms.com/string/rabin-karp.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aStringsPatternMatching.id, title: "String Matching Algorithms", url: "https://www.youtube.com/watch?v=V5-7GzOfADQ", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Geometry & Other Topics
    await ensureResource({ moduleId: aGeometry.id, title: "Convex Hull Algorithm", url: "https://cp-algorithms.com/geometry/convex-hull.html", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aGeometry.id, title: "Closest Pair of Points", url: "https://cp-algorithms.com/geometry/closest-pair.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cp-algorithms.com" });
    await ensureResource({ moduleId: aGeometry.id, title: "Computational Geometry", url: "https://www.youtube.com/watch?v=Ktktgqh7aXw", type: "VIDEO", estMinutes: 28, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Problem Solving Strategies
    await ensureResource({ moduleId: aProblemSolving.id, title: "Sliding Window Technique", url: "https://www.geeksforgeeks.org/window-sliding-technique/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aProblemSolving.id, title: "Two Pointers Technique", url: "https://www.geeksforgeeks.org/two-pointers-technique/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "geeksforgeeks.org" });
    await ensureResource({ moduleId: aProblemSolving.id, title: "N-Queens Problem", url: "https://leetcode.com/problems/n-queens/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "leetcode.com" });

    // Path: Cloud Fundamentals
    const cloud = await prisma.path.upsert({
        where: { slug: "cloud-fundamentals" },
        update: { isPublished: true },
        create: {
            title: "Cloud Fundamentals",
            slug: "cloud-fundamentals",
            description: "Comprehensive cloud computing mastery: from basic concepts to advanced multi-cloud strategies and modern cloud-native architectures.",
            isPublished: true,
        },
    });

    // Comprehensive Cloud Fundamentals curriculum (17 modules)
    const cIntro = await ensureModule(cloud.id, "Introduction to Cloud Computing", 1, "What is cloud computing? (IaaS, PaaS, SaaS), deployment models, benefits");
    const cGlobalInfra = await ensureModule(cloud.id, "Global Infrastructure", 2, "Regions, Availability Zones (AZs), Edge locations, CDN basics");
    const cCompute = await ensureModule(cloud.id, "Compute Services", 3, "IaaS: VMs, PaaS: App Engine, Serverless: Lambda, Cloud Functions");
    const cStorage = await ensureModule(cloud.id, "Storage Services", 4, "Block storage, Object storage, File storage across AWS/GCP/Azure");
    const cDatabases = await ensureModule(cloud.id, "Databases in the Cloud", 5, "Relational (SQL), NoSQL, Data warehousing services");
    const cNetworking = await ensureModule(cloud.id, "Networking Fundamentals", 6, "VPC, subnets, CIDR, gateways, peering, VPNs, load balancing");
    const cIAM = await ensureModule(cloud.id, "Identity & Access Management (IAM)", 7, "Users, groups, roles, policies, principle of least privilege");
    const cMonitoring = await ensureModule(cloud.id, "Monitoring, Logging & Observability", 8, "Metrics, logs, alerts, dashboards, CloudWatch, Stackdriver");
    const cCostMgmt = await ensureModule(cloud.id, "Cost Management", 9, "Pay-as-you-go, reserved vs spot instances, billing alerts, cost optimization");
    const cSecurity = await ensureModule(cloud.id, "Security in the Cloud", 10, "Shared responsibility model, encryption, KMS, security best practices");
    const cHAScaling = await ensureModule(cloud.id, "High Availability & Scalability", 11, "Horizontal vs vertical scaling, auto-scaling groups, fault tolerance");
    const cDisasterRecovery = await ensureModule(cloud.id, "Disaster Recovery & Backups", 12, "RPO, RTO, backups vs replication vs failover strategies");
    const cDevOpsIntegration = await ensureModule(cloud.id, "Cloud DevOps Integration", 13, "CI/CD pipelines in cloud, GitHub Actions, CodePipeline, Cloud Build");
    const cCloudNative = await ensureModule(cloud.id, "Cloud-native & Containers", 14, "Containers vs VMs, Kubernetes basics, managed K8s (EKS, GKE, AKS)");
    const cServerless = await ensureModule(cloud.id, "Serverless & Event-driven Architectures", 15, "Triggers, event sources, serverless patterns and best practices");
    const cCompliance = await ensureModule(cloud.id, "Compliance & Governance", 16, "GDPR, HIPAA, SOC2, tagging, resource policies, governance tools");
    const cMultiCloud = await ensureModule(cloud.id, "Multi-Cloud & Hybrid Strategies", 17, "Portability, lock-in, service mesh, Anthos, Azure Arc");

    // Resources for Introduction to Cloud Computing
    await ensureResource({ moduleId: cIntro.id, title: "What is Cloud Computing? (AWS)", url: "https://aws.amazon.com/what-is-cloud-computing/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cIntro.id, title: "Azure — What is Cloud Computing?", url: "https://azure.microsoft.com/overview/what-is-cloud-computing/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "azure.microsoft.com" });
    await ensureResource({ moduleId: cIntro.id, title: "Cloud Computing Tutorial", url: "https://www.youtube.com/watch?v=M988_fsOSWo", type: "VIDEO", estMinutes: 25, isFree: true, sourceDomain: "youtube.com" });

    // Resources for Global Infrastructure
    await ensureResource({ moduleId: cGlobalInfra.id, title: "AWS Global Infrastructure", url: "https://aws.amazon.com/about-aws/global-infrastructure/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cGlobalInfra.id, title: "Google Cloud Infrastructure", url: "https://cloud.google.com/docs/geography", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cGlobalInfra.id, title: "Azure Global Infrastructure", url: "https://azure.microsoft.com/en-us/global-infrastructure/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "azure.microsoft.com" });

    // Resources for Compute Services
    await ensureResource({ moduleId: cCompute.id, title: "AWS Compute Options Overview", url: "https://aws.amazon.com/compute/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cCompute.id, title: "Google Cloud Compute", url: "https://cloud.google.com/products/compute", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cCompute.id, title: "Azure Compute Services", url: "https://azure.microsoft.com/en-us/products/category/compute/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "azure.microsoft.com" });

    // Resources for Storage Services
    await ensureResource({ moduleId: cStorage.id, title: "Object Storage — S3 Basics", url: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cStorage.id, title: "Google Cloud Storage", url: "https://cloud.google.com/storage/docs", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cStorage.id, title: "Azure Storage", url: "https://docs.microsoft.com/en-us/azure/storage/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Databases in the Cloud
    await ensureResource({ moduleId: cDatabases.id, title: "AWS Database Services", url: "https://aws.amazon.com/products/databases/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cDatabases.id, title: "Google Cloud Databases", url: "https://cloud.google.com/products/databases", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cDatabases.id, title: "Azure Database Services", url: "https://azure.microsoft.com/en-us/products/category/databases/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "azure.microsoft.com" });

    // Resources for Networking Fundamentals
    await ensureResource({ moduleId: cNetworking.id, title: "VPC — Virtual Private Cloud", url: "https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cNetworking.id, title: "Google Cloud VPC", url: "https://cloud.google.com/vpc/docs", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cNetworking.id, title: "Azure Virtual Network", url: "https://docs.microsoft.com/en-us/azure/virtual-network/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Identity & Access Management (IAM)
    await ensureResource({ moduleId: cIAM.id, title: "AWS IAM", url: "https://docs.aws.amazon.com/iam/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cIAM.id, title: "Google Cloud IAM", url: "https://cloud.google.com/iam/docs", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cIAM.id, title: "Azure Active Directory", url: "https://docs.microsoft.com/en-us/azure/active-directory/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Monitoring, Logging & Observability
    await ensureResource({ moduleId: cMonitoring.id, title: "AWS CloudWatch", url: "https://docs.aws.amazon.com/cloudwatch/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cMonitoring.id, title: "Google Cloud Monitoring", url: "https://cloud.google.com/monitoring", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cMonitoring.id, title: "Azure Monitor", url: "https://docs.microsoft.com/en-us/azure/azure-monitor/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Cost Management
    await ensureResource({ moduleId: cCostMgmt.id, title: "AWS Cost Explorer", url: "https://aws.amazon.com/aws-cost-management/aws-cost-explorer/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cCostMgmt.id, title: "Google Cloud Billing", url: "https://cloud.google.com/billing/docs", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cCostMgmt.id, title: "Azure Cost Management", url: "https://docs.microsoft.com/en-us/azure/cost-management-billing/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Security in the Cloud
    await ensureResource({ moduleId: cSecurity.id, title: "AWS Security Best Practices", url: "https://aws.amazon.com/security/security-learning/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cSecurity.id, title: "Google Cloud Security", url: "https://cloud.google.com/security", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cSecurity.id, title: "Azure Security", url: "https://docs.microsoft.com/en-us/azure/security/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for High Availability & Scalability
    await ensureResource({ moduleId: cHAScaling.id, title: "AWS Auto Scaling", url: "https://docs.aws.amazon.com/autoscaling/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cHAScaling.id, title: "Google Cloud Load Balancing", url: "https://cloud.google.com/load-balancing", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cHAScaling.id, title: "Azure Load Balancer", url: "https://docs.microsoft.com/en-us/azure/load-balancer/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Disaster Recovery & Backups
    await ensureResource({ moduleId: cDisasterRecovery.id, title: "AWS Backup", url: "https://docs.aws.amazon.com/aws-backup/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cDisasterRecovery.id, title: "Google Cloud Backup", url: "https://cloud.google.com/backup", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cDisasterRecovery.id, title: "Azure Backup", url: "https://docs.microsoft.com/en-us/azure/backup/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Cloud DevOps Integration
    await ensureResource({ moduleId: cDevOpsIntegration.id, title: "AWS CodePipeline", url: "https://docs.aws.amazon.com/codepipeline/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cDevOpsIntegration.id, title: "Google Cloud Build", url: "https://cloud.google.com/build", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cDevOpsIntegration.id, title: "Azure DevOps", url: "https://docs.microsoft.com/en-us/azure/devops/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Cloud-native & Containers
    await ensureResource({ moduleId: cCloudNative.id, title: "Amazon EKS", url: "https://docs.aws.amazon.com/eks/", type: "DOC", estMinutes: 35, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cCloudNative.id, title: "Google Kubernetes Engine (GKE)", url: "https://cloud.google.com/kubernetes-engine", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cCloudNative.id, title: "Azure Kubernetes Service (AKS)", url: "https://docs.microsoft.com/en-us/azure/aks/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Serverless & Event-driven Architectures
    await ensureResource({ moduleId: cServerless.id, title: "AWS Lambda", url: "https://docs.aws.amazon.com/lambda/", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cServerless.id, title: "Google Cloud Functions", url: "https://cloud.google.com/functions", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cServerless.id, title: "Azure Functions", url: "https://docs.microsoft.com/en-us/azure/azure-functions/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Compliance & Governance
    await ensureResource({ moduleId: cCompliance.id, title: "AWS Config", url: "https://docs.aws.amazon.com/config/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "aws.amazon.com" });
    await ensureResource({ moduleId: cCompliance.id, title: "Google Cloud Organization Policy", url: "https://cloud.google.com/resource-manager/docs/organization-policy", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cCompliance.id, title: "Azure Policy", url: "https://docs.microsoft.com/en-us/azure/governance/policy/", type: "DOC", estMinutes: 20, isFree: true, sourceDomain: "microsoft.com" });

    // Resources for Multi-Cloud & Hybrid Strategies
    await ensureResource({ moduleId: cMultiCloud.id, title: "Google Cloud Anthos", url: "https://cloud.google.com/anthos", type: "DOC", estMinutes: 30, isFree: true, sourceDomain: "cloud.google.com" });
    await ensureResource({ moduleId: cMultiCloud.id, title: "Azure Arc", url: "https://docs.microsoft.com/en-us/azure/azure-arc/", type: "DOC", estMinutes: 25, isFree: true, sourceDomain: "microsoft.com" });
    await ensureResource({ moduleId: cMultiCloud.id, title: "Multi-Cloud Strategy Guide", url: "https://www.youtube.com/watch?v=7K4VAhBEQyI", type: "VIDEO", estMinutes: 35, isFree: true, sourceDomain: "youtube.com" });

    // Quiz system setup
    console.log("Setting up quiz system...");

    // Helper function to create quizzes with questions
    async function createQuizWithQuestions(moduleId: number, title: string, description: string, questions: Array<{
        questionText: string;
        options: string[];
        correctAnswer: string[];
        explanation?: string;
    }>) {
        const quiz = await prisma.quiz.upsert({
            where: { moduleId },
            update: {},
            create: {
                moduleId,
                title,
                description,
                questionCount: questions.length,
                individualPrice: 0.50,
            },
        });

        // Clear existing questions and create new ones
        await prisma.question.deleteMany({ where: { quizId: quiz.id } });

        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await prisma.question.create({
                data: {
                    quizId: quiz.id,
                    questionText: q.questionText,
                    type: "MULTIPLE_CHOICE",
                    options: JSON.stringify(q.options),
                    correctAnswer: JSON.stringify(q.correctAnswer),
                    explanation: q.explanation,
                    orderIndex: i,
                },
            });
        }

        return quiz;
    }

    // 1. HTML Semantics & Document Structure Quiz
    await createQuizWithQuestions(feHtml.id, "HTML Semantics & Document Structure Quiz", "Test your knowledge of HTML semantic elements and document structure", [
        {
            questionText: "Which HTML element is most semantically appropriate for the main content of a webpage?",
            options: ["<div>", "<main>", "<section>", "<article>"],
            correctAnswer: ["<main>"],
            explanation: "<main> is the semantic element specifically designed for the main content of a webpage."
        },
        {
            questionText: "What is the purpose of the <nav> element?",
            options: ["To create a navigation menu", "To define a section of navigation links", "To style navigation elements", "To create a sidebar"],
            correctAnswer: ["To define a section of navigation links"],
            explanation: "<nav> is used to define a section containing navigation links."
        },
        {
            questionText: "Which element should be used for a self-contained piece of content that could be distributed independently?",
            options: ["<section>", "<article>", "<aside>", "<div>"],
            correctAnswer: ["<article>"],
            explanation: "<article> is used for self-contained content that could be distributed independently."
        },
        {
            questionText: "What is the correct order of HTML document structure?",
            options: ["<html><head><body>", "<head><html><body>", "<html><body><head>", "<body><head><html>"],
            correctAnswer: ["<html><head><body>"],
            explanation: "The correct order is <html><head><body> where head contains metadata and body contains the visible content."
        },
        {
            questionText: "Which element is used to define a section of content that is tangentially related to the content around it?",
            options: ["<section>", "<aside>", "<article>", "<div>"],
            correctAnswer: ["<aside>"],
            explanation: "<aside> is used for content that is tangentially related to the main content."
        }
    ]);

    // 2. Forms & Native Validation Quiz
    await createQuizWithQuestions(feForms.id, "Forms & Native Validation Quiz", "Test your knowledge of HTML forms and native validation", [
        {
            questionText: "Which input type is best for collecting email addresses?",
            options: ["type='text'", "type='email'", "type='url'", "type='string'"],
            correctAnswer: ["type='email'"],
            explanation: "type='email' provides built-in validation and mobile keyboard optimization for email addresses."
        },
        {
            questionText: "What does the 'required' attribute do?",
            options: ["Makes the field read-only", "Prevents form submission if empty", "Sets a default value", "Makes the field optional"],
            correctAnswer: ["Prevents form submission if empty"],
            explanation: "The 'required' attribute prevents form submission if the field is empty and shows validation messages."
        },
        {
            questionText: "Which attribute limits the minimum value for a number input?",
            options: ["min", "minimum", "low", "smallest"],
            correctAnswer: ["min"],
            explanation: "The 'min' attribute sets the minimum allowed value for number inputs."
        },
        {
            questionText: "What is the purpose of the 'pattern' attribute?",
            options: ["To style the input", "To define a regex pattern for validation", "To set a placeholder", "To make the field required"],
            correctAnswer: ["To define a regex pattern for validation"],
            explanation: "The 'pattern' attribute accepts a regex pattern to validate the input value."
        },
        {
            questionText: "Which element is used to group related form controls?",
            options: ["<div>", "<section>", "<fieldset>", "<group>"],
            correctAnswer: ["<fieldset>"],
            explanation: "<fieldset> is used to group related form controls and can include a <legend> for the group title."
        }
    ]);

    // 3. CSS Selectors & Specificity Quiz
    await createQuizWithQuestions(feSelectors.id, "CSS Selectors & Specificity Quiz", "Test your knowledge of CSS selectors and specificity rules", [
        {
            questionText: "Which selector has the highest specificity?",
            options: [".class", "#id", "element", "element.class"],
            correctAnswer: ["#id"],
            explanation: "ID selectors have the highest specificity (0,1,0,0), followed by class selectors (0,0,1,0)."
        },
        {
            questionText: "What does the descendant selector (space) do?",
            options: ["Selects direct children only", "Selects any descendant", "Selects adjacent siblings", "Selects all siblings"],
            correctAnswer: ["Selects any descendant"],
            explanation: "The descendant selector (space) selects any element that is a descendant of the first element."
        },
        {
            questionText: "Which pseudo-class selects an element when the user hovers over it?",
            options: [":active", ":hover", ":focus", ":visited"],
            correctAnswer: [":hover"],
            explanation: ":hover is triggered when the user hovers over an element with a pointing device."
        },
        {
            questionText: "What is the specificity of 'div.container p'?",
            options: ["0,0,0,2", "0,0,1,2", "0,0,0,1", "0,0,1,1"],
            correctAnswer: ["0,0,0,2"],
            explanation: "Two element selectors (div and p) give a specificity of 0,0,0,2."
        },
        {
            questionText: "Which selector targets the first child element?",
            options: [":first", ":first-child", ":first-of-type", ":nth-child(1)"],
            correctAnswer: [":first-child", ":nth-child(1)"],
            explanation: "Both :first-child and :nth-child(1) target the first child element."
        }
    ]);

    // 4. CSS Box Model & Visual Formatting Quiz
    await createQuizWithQuestions(feBox.id, "CSS Box Model & Visual Formatting Quiz", "Test your knowledge of the CSS box model and positioning", [
        {
            questionText: "Which CSS property controls the space between the content and the border?",
            options: ["margin", "padding", "border", "spacing"],
            correctAnswer: ["padding"],
            explanation: "Padding controls the space between the content and the border."
        },
        {
            questionText: "What does 'box-sizing: border-box' do?",
            options: ["Includes padding and border in element width", "Excludes padding and border from element width", "Only includes border in width", "Only includes padding in width"],
            correctAnswer: ["Includes padding and border in element width"],
            explanation: "border-box includes padding and border in the element's total width and height."
        },
        {
            questionText: "Which positioning value removes the element from the normal document flow?",
            options: ["static", "relative", "absolute", "fixed"],
            correctAnswer: ["absolute", "fixed"],
            explanation: "Both absolute and fixed positioning remove elements from the normal document flow."
        },
        {
            questionText: "What is the default value of the 'position' property?",
            options: ["relative", "absolute", "static", "fixed"],
            correctAnswer: ["static"],
            explanation: "static is the default positioning value for all elements."
        },
        {
            questionText: "Which property controls how an element is displayed?",
            options: ["visibility", "display", "position", "float"],
            correctAnswer: ["display"],
            explanation: "The display property controls how an element is rendered (block, inline, flex, etc.)."
        }
    ]);

    // 5. Flexbox Layout Patterns Quiz
    await createQuizWithQuestions(feFlex.id, "Flexbox Layout Patterns Quiz", "Test your knowledge of CSS Flexbox properties and patterns", [
        {
            questionText: "Which flexbox property controls the direction of flex items?",
            options: ["flex-direction", "flex-flow", "flex-wrap", "flex-order"],
            correctAnswer: ["flex-direction"],
            explanation: "flex-direction controls whether flex items are laid out in a row or column."
        },
        {
            questionText: "What does 'justify-content: center' do?",
            options: ["Centers items vertically", "Centers items horizontally", "Centers items both ways", "Distributes space evenly"],
            correctAnswer: ["Centers items horizontally"],
            explanation: "justify-content controls alignment along the main axis (horizontally in row direction)."
        },
        {
            questionText: "Which property controls how flex items grow to fill available space?",
            options: ["flex-grow", "flex-shrink", "flex-basis", "flex"],
            correctAnswer: ["flex-grow"],
            explanation: "flex-grow controls how much a flex item can grow relative to other items."
        },
        {
            questionText: "What is the default value of 'flex-wrap'?",
            options: ["wrap", "nowrap", "wrap-reverse", "flex-wrap"],
            correctAnswer: ["nowrap"],
            explanation: "nowrap is the default, meaning flex items will not wrap to new lines."
        },
        {
            questionText: "Which property aligns flex items along the cross axis?",
            options: ["justify-content", "align-items", "align-content", "align-self"],
            correctAnswer: ["align-items"],
            explanation: "align-items controls alignment along the cross axis (vertically in row direction)."
        }
    ]);

    // 6. CSS Grid for Complex Layouts Quiz
    await createQuizWithQuestions(feGrid.id, "CSS Grid for Complex Layouts Quiz", "Assess your understanding of CSS Grid concepts and patterns", [
        {
            questionText: "Which property defines the columns of a grid container?",
            options: ["grid-template-rows", "grid-auto-columns", "grid-template-columns", "grid-columns"],
            correctAnswer: ["grid-template-columns"],
        },
        {
            questionText: "What does repeat(3, 1fr) create?",
            options: ["3 rows of equal height", "3 columns of equal width", "1 column repeated 3 times with auto width", "A gap of 1fr repeated 3 times"],
            correctAnswer: ["3 columns of equal width"],
        },
        {
            questionText: "Which properties place an item starting at column 2 spanning 2 columns?",
            options: ["grid-column: 2 / 4", "grid-column: 2 / span 2", "grid-column: span 2 / 2", "grid-column: 1 / 3"],
            correctAnswer: ["grid-column: 2 / 4", "grid-column: 2 / span 2"],
        }
    ]);

    // 7. Responsive Design & Media Queries Quiz
    await createQuizWithQuestions(feResponsive.id, "Responsive Design & Media Queries Quiz", "Check your mobile-first and media query knowledge", [
        {
            questionText: "Which approach is recommended for modern responsive design?",
            options: ["Desktop-first", "Mobile-first", "Tablet-first", "Fixed layout"],
            correctAnswer: ["Mobile-first"],
        },
        {
            questionText: "Select a correct mobile-first media query for min-width 768px:",
            options: ["@media (max-width: 768px)", "@media (min-width: 768px)", "@media screen and (under: 768px)", "@media (>=768px)"],
            correctAnswer: ["@media (min-width: 768px)"],
        },
        {
            questionText: "Which HTML attribute helps with responsive images?",
            options: ["srcdoc", "srcset", "preload", "defer"],
            correctAnswer: ["srcset"],
        }
    ]);

    // 8. Typography & Iconography Quiz
    await createQuizWithQuestions(feType.id, "Typography & Iconography Quiz", "Gauge your knowledge of web typography and icons", [
        {
            questionText: "What CSS property controls line height?",
            options: ["line-height", "text-height", "font-leading", "baseline"],
            correctAnswer: ["line-height"],
        },
        {
            questionText: "Which unit is best for scalable font sizes?",
            options: ["px", "pt", "em/rem", "vh"],
            correctAnswer: ["em/rem"],
        },
        {
            questionText: "Which is generally preferred for crisp, accessible icons?",
            options: ["Raster PNG sprites", "Inline SVG", "Base64 JPEG", "Icon fonts only"],
            correctAnswer: ["Inline SVG"],
        }
    ]);

    // 9. Colors, Themes & CSS Variables Quiz
    await createQuizWithQuestions(feColors.id, "Colors, Themes & CSS Variables Quiz", "Test your theming and CSS custom properties knowledge", [
        {
            questionText: "How do you define a CSS custom property?",
            options: ["--primary: #000;", "$primary: #000;", "@primary: #000;", "var-primary: #000;"],
            correctAnswer: ["--primary: #000;"],
        },
        {
            questionText: "How do you use a custom property with a fallback?",
            options: ["var(--color, #333)", "use(--color, #333)", "var(--color || #333)", "var(--color) || #333"],
            correctAnswer: ["var(--color, #333)"],
        },
        {
            questionText: "What's a good contrast ratio guideline for text?",
            options: ["1.5:1", "3:1", "4.5:1", "10:1"],
            correctAnswer: ["4.5:1"],
        }
    ]);

    // 10. Modern CSS Features Quiz
    await createQuizWithQuestions(feModernCss.id, "Modern CSS Features Quiz", "Review modern CSS like :has(), layers, logical props, nesting", [
        {
            questionText: "What does :has() enable?",
            options: ["Server-side rendering", "Parent-level conditional styling", "Scoped CSS", "Shadow DOM styling"],
            correctAnswer: ["Parent-level conditional styling"],
        },
        {
            questionText: "Which feature helps control cascade priority explicitly?",
            options: ["@scope", "@layer", ":host", "unset"],
            correctAnswer: ["@layer"],
        },
        {
            questionText: "Which are logical properties?",
            options: ["margin-top", "padding-inline", "inset-block", "border-left"],
            correctAnswer: ["padding-inline", "inset-block"],
        }
    ]);

    // 11. CSS Architecture & Reuse Quiz
    await createQuizWithQuestions(feArch.id, "CSS Architecture & Reuse Quiz", "Validate your BEM, utilities, and composition knowledge", [
        {
            questionText: "In BEM, what is the correct naming format?",
            options: ["block__element--modifier", "block--element__modifier", "block_element-modifier", "element__block--modifier"],
            correctAnswer: ["block__element--modifier"],
        },
        {
            questionText: "A utility class is typically…",
            options: ["A semantic component name", "A single-purpose styling class", "A CSS variable", "A JavaScript class"],
            correctAnswer: ["A single-purpose styling class"],
        },
        {
            questionText: "Which approach reduces duplication and improves maintainability?",
            options: ["Global !important", "Deep nesting", "Composition and tokens", "Huge monolithic files"],
            correctAnswer: ["Composition and tokens"],
        }
    ]);

    // 12. JavaScript Essentials Quiz
    await createQuizWithQuestions(feJs.id, "JavaScript Essentials Quiz", "Fundamentals like variables, scope, functions, and ES6", [
        {
            questionText: "Which keyword creates a block-scoped variable?",
            options: ["var", "let", "function", "static"],
            correctAnswer: ["let"],
        },
        {
            questionText: "What does const guarantee?",
            options: ["Immutability of objects", "No reassignment of the binding", "No property changes", "Deep freeze"],
            correctAnswer: ["No reassignment of the binding"],
        },
        {
            questionText: "Arrow functions differ by…",
            options: ["Own this binding", "Lexical this", "Automatic hoisting", "Implicit prototype"],
            correctAnswer: ["Lexical this"],
        }
    ]);

    // 13. DOM, Events & Browser APIs Quiz
    await createQuizWithQuestions(feDom.id, "DOM, Events & Browser APIs Quiz", "Manipulating DOM, handling events, and using browser APIs", [
        {
            questionText: "Which method selects the first match of a CSS selector?",
            options: ["getElementById", "querySelector", "querySelectorAll", "getElementsByClassName"],
            correctAnswer: ["querySelector"],
        },
        {
            questionText: "Which is true about addEventListener?",
            options: ["It replaces inline handlers", "It supports multiple listeners", "It requires capturing only", "It doesn't support options"],
            correctAnswer: ["It supports multiple listeners"],
        },
        {
            questionText: "Which API is used to make network requests in modern browsers?",
            options: ["XMLHttpRequest", "fetch", "socket", "navigator"],
            correctAnswer: ["fetch"],
        }
    ]);

    // 14. Async JS & Fetch Quiz
    await createQuizWithQuestions(feApi.id, "Async JS & Fetch Quiz", "Promises, async/await, and fetch patterns", [
        {
            questionText: "What does await do?",
            options: ["Blocks the thread", "Pauses within async function until promise settles", "Cancels a promise", "Retries request"],
            correctAnswer: ["Pauses within async function until promise settles"],
        },
        {
            questionText: "How to handle fetch errors properly?",
            options: ["Assume 200", "Check response.ok and try/catch", "Use then only", "Ignore non-200"],
            correctAnswer: ["Check response.ok and try/catch"],
        },
        {
            questionText: "Which cancels an in-flight fetch?",
            options: ["AbortController", "CancelToken", "Timeout API", "EventTarget"],
            correctAnswer: ["AbortController"],
        }
    ]);

    // 15. State & Data Modeling in the Browser Quiz
    await createQuizWithQuestions(feState.id, "State & Data Modeling in the Browser Quiz", "Local/session storage and client state patterns", [
        {
            questionText: "Which storage persists across tabs and sessions?",
            options: ["localStorage", "sessionStorage", "memory", "cookie with no expiration"],
            correctAnswer: ["localStorage"],
        },
        {
            questionText: "What format should you store complex objects in web storage?",
            options: ["Plain objects", "JSON strings", "Buffers", "Base64 only"],
            correctAnswer: ["JSON strings"],
        },
        {
            questionText: "Which is a good practice for client state?",
            options: ["Global mutable singletons", "Immutable updates", "Frequent full reloads", "Store functions in storage"],
            correctAnswer: ["Immutable updates"],
        }
    ]);

    // 16. Accessibility Fundamentals (a11y) Quiz
    await createQuizWithQuestions(feA11y.id, "Accessibility Fundamentals (a11y) Quiz", "ARIA roles, semantics, and keyboard navigation", [
        {
            questionText: "Which attribute ties a label to an input by id?",
            options: ["aria-for", "for", "data-label", "aria-labelledby only"],
            correctAnswer: ["for"],
        },
        {
            questionText: "A button activated via keyboard should respond to…",
            options: ["click only", "Enter/Space", "Arrow keys", "Tab"],
            correctAnswer: ["Enter/Space"],
        },
        {
            questionText: "ARIA should be used…",
            options: ["To replace semantic HTML", "When semantics are insufficient", "Everywhere by default", "Only for styling"],
            correctAnswer: ["When semantics are insufficient"],
        }
    ]);

    // 17. Web Performance Basics Quiz
    await createQuizWithQuestions(fePerf.id, "Web Performance Basics Quiz", "DevTools, metrics, and optimization basics", [
        {
            questionText: "Which metric measures when the main content is visible?",
            options: ["TTFB", "FCP", "CLS", "FID"],
            correctAnswer: ["FCP"],
        },
        {
            questionText: "Which practice helps performance?",
            options: ["Unoptimized images", "Code splitting", "Blocking synchronous scripts", "Large render-blocking CSS"],
            correctAnswer: ["Code splitting"],
        },
        {
            questionText: "Which tool helps profile runtime performance?",
            options: ["Chrome DevTools Performance", "Ping", "Curl", "traceroute"],
            correctAnswer: ["Chrome DevTools Performance"],
        }
    ]);

    // 18. Tooling & TypeScript Intro Quiz
    await createQuizWithQuestions(feTooling.id, "Tooling & TypeScript Intro Quiz", "Tooling basics, linting, and TS fundamentals", [
        {
            questionText: "Which command compiles TypeScript to JavaScript by default?",
            options: ["ts-node", "tsc", "node", "babel"],
            correctAnswer: ["tsc"],
        },
        {
            questionText: "What does a linter (like ESLint) help with?",
            options: ["Runtime debugging only", "Static code quality and consistency", "Bundling assets", "CSS preprocessing"],
            correctAnswer: ["Static code quality and consistency"],
        },
        {
            questionText: "TypeScript's any type means…",
            options: ["Stricter type", "Opt-out of type checking for that value", "Union of all types with safety", "Never assignable"],
            correctAnswer: ["Opt-out of type checking for that value"],
        }
    ]);

    // Done adding quizzes for Frontend Foundations
    console.log("Frontend Foundations quizzes seeded.");

    console.log("Quiz system setup complete!");

    // Helper to append additional questions to an existing quiz
    async function appendQuestions(quizId: number, questions: Array<{
        questionText: string;
        options: string[];
        correctAnswer: string[];
        explanation?: string;
    }>) {
        const existingCount = await prisma.question.count({ where: { quizId } });
        for (let i = 0; i < questions.length; i++) {
            const q = questions[i];
            await prisma.question.create({
                data: {
                    quizId,
                    questionText: q.questionText,
                    type: "MULTIPLE_CHOICE",
                    options: JSON.stringify(q.options),
                    correctAnswer: JSON.stringify(q.correctAnswer),
                    explanation: q.explanation,
                    orderIndex: existingCount + i,
                },
            });
        }
        await prisma.quiz.update({ where: { id: quizId }, data: { questionCount: existingCount + questions.length } });
    }

    // ------- Top up questions to reach target counts -------

    // Core modules: 7 questions each
    {
        const htmlQuiz = await prisma.quiz.findUniqueOrThrow({ where: { moduleId: feHtml.id } });
        await appendQuestions(htmlQuiz.id, [
            { questionText: "Which element represents introductory content typically found before the main content?", options: ["<section>", "<header>", "<aside>", "<nav>"], correctAnswer: ["<header>"] },
            { questionText: "What element represents a landmark for assistive technologies to jump to primary site navigation?", options: ["<main>", "<nav>", "<footer>", "<article>"], correctAnswer: ["<nav>"] }
        ]);

        const selQuiz = await prisma.quiz.findUniqueOrThrow({ where: { moduleId: feSelectors.id } });
        await appendQuestions(selQuiz.id, [
            { questionText: "Which selector matches any element with both classes 'btn' and 'primary'?", options: [".btn .primary", ".btn.primary", "btn.primary", "#btn .primary"], correctAnswer: [".btn.primary"] },
            { questionText: "Which pseudo-class targets a focused input?", options: [":hover", ":focus", ":active", ":checked"], correctAnswer: [":focus"] }
        ]);

        const boxQuiz = await prisma.quiz.findUniqueOrThrow({ where: { moduleId: feBox.id } });
        await appendQuestions(boxQuiz.id, [
            { questionText: "Which property adds space outside the border?", options: ["padding", "margin", "gap", "outline"], correctAnswer: ["margin"] },
            { questionText: "Which display value establishes a new block formatting context commonly used for layouts?", options: ["inline", "block", "flex", "contents"], correctAnswer: ["flex"] }
        ]);

        const flexQuiz = await prisma.quiz.findUniqueOrThrow({ where: { moduleId: feFlex.id } });
        await appendQuestions(flexQuiz.id, [
            { questionText: "Which property allows items to wrap onto multiple lines?", options: ["flex-grow", "flex-shrink", "flex-wrap", "align-content"], correctAnswer: ["flex-wrap"] },
            { questionText: "What does 'align-self' control?", options: ["Main-axis distribution", "Cross-axis alignment for a single item", "Item growth", "Item basis"], correctAnswer: ["Cross-axis alignment for a single item"] }
        ]);

        const gridQuiz = await prisma.quiz.findUniqueOrThrow({ where: { moduleId: feGrid.id } });
        await appendQuestions(gridQuiz.id, [
            { questionText: "Which property creates gaps between grid tracks?", options: ["grid-gap", "gap", "spacing", "track-gap"], correctAnswer: ["gap"] },
            { questionText: "How do you place an item from row 1 to 3?", options: ["grid-row: 1 / 3", "grid-row: span 3", "grid-row: 3 / 1", "grid-row: 1-3"], correctAnswer: ["grid-row: 1 / 3"] },
            { questionText: "Which function repeats columns to fill available space with a min size?", options: ["auto-fill", "repeat", "minmax", "fit-content"], correctAnswer: ["minmax"] },
            { questionText: "Which keyword auto-fills as many columns as possible?", options: ["auto-fit", "auto-fill", "fit-cols", "repeat-auto"], correctAnswer: ["auto-fill"] }
        ]);

        const jsQuiz = await prisma.quiz.findUniqueOrThrow({ where: { moduleId: feJs.id } });
        await appendQuestions(jsQuiz.id, [
            { questionText: "Which comparison is strictly equal and type-safe?", options: ["==", "===", "=", "~= "], correctAnswer: ["==="] },
            { questionText: "What does array.map return?", options: ["Mutated original array", "A new array", "An iterator", "A promise"], correctAnswer: ["A new array"] },
            { questionText: "Which data type is 'null' typeof in JS?", options: ["'object'", "'null'", "'undefined'", "'number'"], correctAnswer: ["'object'"] },
            { questionText: "Which keyword declares a function-scoped variable?", options: ["let", "const", "var", "static"], correctAnswer: ["var"] }
        ]);

        const domQuiz = await prisma.quiz.findUniqueOrThrow({ where: { moduleId: feDom.id } });
        await appendQuestions(domQuiz.id, [
            { questionText: "Which event fires when the initial HTML document is fully loaded and parsed?", options: ["load", "DOMContentLoaded", "ready", "parse"], correctAnswer: ["DOMContentLoaded"] },
            { questionText: "Which property returns a live collection of elements by class name?", options: ["querySelectorAll", "getElementsByClassName", "getElementsByTagName", "children"], correctAnswer: ["getElementsByClassName"] },
            { questionText: "Which method prevents default browser action?", options: ["stopPropagation()", "preventDefault()", "stopImmediatePropagation()", "cancel()"], correctAnswer: ["preventDefault()"] },
            { questionText: "Which API schedules a callback after painting?", options: ["requestAnimationFrame", "setTimeout", "queueMicrotask", "setInterval"], correctAnswer: ["requestAnimationFrame"] }
        ]);
    }

    // Non-core modules: ensure at least 5 questions each
    async function ensureFive(moduleId: number, extras: Array<{ questionText: string; options: string[]; correctAnswer: string[]; explanation?: string }>) {
        const q = await prisma.quiz.findUniqueOrThrow({ where: { moduleId } });
        const count = await prisma.question.count({ where: { quizId: q.id } });
        if (count < 5) {
            await appendQuestions(q.id, extras.slice(0, 5 - count));
        }
    }

    await ensureFive(feResponsive.id, [
        { questionText: "Which unit scales with viewport width?", options: ["em", "rem", "vw", "px"], correctAnswer: ["vw"] },
        { questionText: "Which media feature targets dark mode?", options: ["(prefers-color-scheme: dark)", "(color-scheme: dark)", "(theme: dark)", "(mode: dark)"], correctAnswer: ["(prefers-color-scheme: dark)"] }
    ]);

    await ensureFive(feType.id, [
        { questionText: "What is font-display: swap used for?", options: ["Anti-aliasing", "FOIT mitigation", "Kerning", "Subpixel rendering"], correctAnswer: ["FOIT mitigation"] },
        { questionText: "Which property controls font weight?", options: ["font-style", "font-weight", "font-variant", "font-synthesis"], correctAnswer: ["font-weight"] }
    ]);

    await ensureFive(feColors.id, [
        { questionText: "Which function mixes colors in CSS?", options: ["mix()", "color-mix()", "blend()", "hsl-mix()"], correctAnswer: ["color-mix()"] },
        { questionText: "Which color space provides perceptual uniformity?", options: ["RGB", "HSL", "Lab/LCH", "CMYK"], correctAnswer: ["Lab/LCH"] }
    ]);

    await ensureFive(feModernCss.id, [
        { questionText: "Which spec enables CSS nesting?", options: ["Selectors 4", "Cascade 6", "CSS Nesting Module", " Houdini"], correctAnswer: ["CSS Nesting Module"] },
        { questionText: "Which property creates container queries?", options: ["@container", "@media", "@scope", "@layer"], correctAnswer: ["@container"] }
    ]);

    await ensureFive(feArch.id, [
        { questionText: "Utilities are especially good for…", options: ["One-off spacing/color", "Complex business logic", "Data fetching", "SEO"], correctAnswer: ["One-off spacing/color"] },
        { questionText: "CSS layers can help with…", options: ["Z-index only", "Cascade control", "Animations", "Grid placement"], correctAnswer: ["Cascade control"] }
    ]);

    await ensureFive(feApi.id, [
        { questionText: "Which reads a JSON body from fetch Response?", options: ["res.text()", "res.json()", "res.body", "res.parse()"], correctAnswer: ["res.json()"] },
        { questionText: "Which microtask queue API defers a callback?", options: ["Promise.resolve().then", "setTimeout", "requestIdleCallback", "RAF"], correctAnswer: ["Promise.resolve().then"] }
    ]);

    await ensureFive(feState.id, [
        { questionText: "Which API stores small key/value pairs in cookies securely?", options: ["localStorage", "HttpOnly cookie (server-set)", "sessionStorage", "indexedDB"], correctAnswer: ["HttpOnly cookie (server-set)"] },
        { questionText: "Which storage is best for large structured data?", options: ["cookies", "localStorage", "indexedDB", "sessionStorage"], correctAnswer: ["indexedDB"] }
    ]);

    await ensureFive(feA11y.id, [
        { questionText: "Which attribute provides an accessible name for non-text content?", options: ["alt", "title", "data-label", "placeholder"], correctAnswer: ["alt"] },
        { questionText: "Focus should be visible…", options: ["Only for mouse users", "For keyboard users", "Never", "Only on mobile"], correctAnswer: ["For keyboard users"] }
    ]);

    await ensureFive(fePerf.id, [
        { questionText: "Which reduces image payloads most?", options: ["Uncompressed PNG", "Modern formats (WebP/AVIF)", "Huge JPEG", "SVG to raster"], correctAnswer: ["Modern formats (WebP/AVIF)"] },
        { questionText: "Which header enables caching?", options: ["Cache-Control", "Allow", "Accept", "Host"], correctAnswer: ["Cache-Control"] }
    ]);

    await ensureFive(feTooling.id, [
        { questionText: "Type definitions for JS libs in TS are provided via…", options: ["@types/*", "DefinitelyTyped only", "npm:types", "tsd"], correctAnswer: ["@types/*"] },
        { questionText: "Which tool bundles modules for the browser?", options: ["webpack", "tsc", "eslint", "prettier"], correctAnswer: ["webpack"] }
    ]);
}

main()
    .then(() => console.log("Seeded."))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
