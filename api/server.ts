/// <reference path="../src/types/express-session.d.ts" />
import path from "path";
import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import csrf from "csurf";
import Stripe from "stripe";
import crypto from "crypto";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import winston from "winston";
import morgan from "morgan";
import compression from "compression";
import sgMail from "@sendgrid/mail";
dotenv.config();
function validateEnvironment() {
    const isProduction = process.env.NODE_ENV === 'production';

    const required = {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL: process.env.DATABASE_URL,
        SESSION_SECRET: process.env.SESSION_SECRET,
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
        STRIPE_PRICE_PATH_USD: process.env.STRIPE_PRICE_PATH_USD,
        STRIPE_PRICE_PREMIUM_USD: process.env.STRIPE_PRICE_PREMIUM_USD,
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
        ...(isProduction && { SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL }),
    };
    const missing = Object.entries(required)
        .filter(([key, value]) => !value)
        .map(([key]) => key);
    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:', missing.join(', '));
        console.error('Please check your .env file and ensure all required variables are set.');
        process.exit(1);
    }
    if (process.env.SESSION_SECRET === "dev-secret-change-me") {
        console.warn('⚠️  Using development SESSION_SECRET. Set a secure secret for production!');
    }
    console.log('✅ Environment validation passed');
}
validateEnvironment();
const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Add error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    logger.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_PATH_USD = process.env.STRIPE_PRICE_PATH_USD || "";
const STRIPE_PRICE_PREMIUM_USD = process.env.STRIPE_PRICE_PREMIUM_USD || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = new Stripe(STRIPE_SECRET_KEY || "");
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || "";
sgMail.setApiKey(SENDGRID_API_KEY);
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'routetodev' },
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ],
});
const VIEWS_DIR = path.join(process.cwd(), "src", "views");
app.set("view engine", "ejs");
app.set("views", VIEWS_DIR);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://api.stripe.com", "https://checkout.stripe.com"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'self'", "https://checkout.stripe.com"],
        },
    },
}));
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: "Too many requests from this IP, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 5 : 50,
    message: "Too many authentication attempts, please try again later.",
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
app.use(compression());
app.use(morgan('combined', {
    stream: { write: (message: string) => logger.info(message.trim()) }
}));
app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    if (!STRIPE_WEBHOOK_SECRET || !sig) return res.status(400).send("Missing signature");
    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
    }
    try {
        if (event.type === "checkout.session.completed") {
            const session = event.data.object as Stripe.Checkout.Session;
            const metadata = (session.metadata || {}) as Record<string, string>;
            const userId = Number(metadata.userId || 0);
            const purchaseType = String(metadata.purchaseType || "");
            const pathId = metadata.pathId ? Number(metadata.pathId) : undefined;
            const paymentId = String(session.payment_intent ?? session.id);
            logger.info('Processing Stripe webhook', { userId, purchaseType, pathId, paymentId });
            const existing = await prisma.quizPurchase.findFirst({ where: { stripePaymentId: paymentId } });
            if (existing) {
                logger.info('Payment already processed', { paymentId });
                return res.json({ received: true, duplicate: true });
            }
            if (userId && purchaseType === "PATH_BUNDLE" && pathId) {
                logger.info('Creating PATH_BUNDLE purchase', { userId, pathId });
                await prisma.quizPurchase.create({
                    data: {
                        userId,
                        pathId,
                        purchaseType: "PATH_BUNDLE",
                        amount: 5,
                        stripePaymentId: paymentId,
                        isActive: true,
                    },
                });
                logger.info('PATH_BUNDLE purchase created successfully', { userId, pathId });
            } else if (userId && purchaseType === "PREMIUM_MEMBERSHIP") {
                logger.info('Updating user to premium', { userId });
                await prisma.user.update({
                    where: { id: userId },
                    data: { isPremium: true, premiumPurchasedAt: new Date() },
                });
                logger.info('User updated to premium successfully', { userId });
            } else {
                logger.warn('Invalid webhook data', { userId, purchaseType, pathId });
            }
        }
    } catch (error) {
        logger.error('Webhook processing error', { error });
    }
    res.json({ received: true });
});
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Add a simple test route
app.get('/test', (req, res) => {
    res.json({ message: 'Server is working!', timestamp: new Date().toISOString() });
});

// Add migration route (remove this after migrations are done)
app.get('/migrate', async (req, res) => {
    try {
        // Test database connection first
        await prisma.$connect();
        console.log('Database connection successful');

        // Create tables using raw SQL - simplified version
        console.log('Creating Path table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Path" (
                "id" SERIAL PRIMARY KEY,
                "title" TEXT NOT NULL,
                "description" TEXT,
                "slug" TEXT NOT NULL UNIQUE,
                "isPublished" BOOLEAN NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Creating User table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "User" (
                "id" SERIAL PRIMARY KEY,
                "email" TEXT NOT NULL UNIQUE,
                "passwordHash" TEXT NOT NULL,
                "name" TEXT,
                "role" TEXT NOT NULL DEFAULT 'USER',
                "isPremium" BOOLEAN NOT NULL DEFAULT false,
                "premiumPurchasedAt" TIMESTAMP(3),
                "emailVerified" BOOLEAN NOT NULL DEFAULT false,
                "emailVerificationToken" TEXT,
                "emailVerificationExpires" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log('Creating Module table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Module" (
                "id" SERIAL PRIMARY KEY,
                "pathId" INTEGER NOT NULL,
                "title" TEXT NOT NULL,
                "description" TEXT,
                "orderIndex" INTEGER NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("pathId") REFERENCES "Path"("id") ON DELETE CASCADE
            );
        `);

        console.log('Creating Quiz table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Quiz" (
                "id" SERIAL PRIMARY KEY,
                "moduleId" INTEGER NOT NULL,
                "title" TEXT NOT NULL,
                "description" TEXT,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE
            );
        `);

        console.log('Creating Question table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "Question" (
                "id" SERIAL PRIMARY KEY,
                "quizId" INTEGER NOT NULL,
                "text" TEXT NOT NULL,
                "options" TEXT[] NOT NULL,
                "correctAnswer" INTEGER NOT NULL,
                "explanation" TEXT,
                "orderIndex" INTEGER NOT NULL,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE
            );
        `);

        console.log('Creating QuizPurchase table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "QuizPurchase" (
                "id" SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                "pathId" INTEGER,
                "purchaseType" TEXT NOT NULL,
                "amount" DECIMAL(10,2) NOT NULL,
                "stripePaymentId" TEXT UNIQUE,
                "isActive" BOOLEAN NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
                FOREIGN KEY ("pathId") REFERENCES "Path"("id") ON DELETE CASCADE
            );
        `);

        console.log('Creating QuizAttempt table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "QuizAttempt" (
                "id" SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                "quizId" INTEGER NOT NULL,
                "score" INTEGER NOT NULL,
                "totalQuestions" INTEGER NOT NULL,
                "answers" JSONB,
                "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
                FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE
            );
        `);

        console.log('Creating UserProgress table...');
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "UserProgress" (
                "id" SERIAL PRIMARY KEY,
                "userId" INTEGER NOT NULL,
                "moduleId" INTEGER NOT NULL,
                "completed" BOOLEAN NOT NULL DEFAULT false,
                "completedAt" TIMESTAMP(3),
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
                FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE,
                UNIQUE("userId", "moduleId")
            );
        `);

        console.log('Tables created successfully');
        res.json({ message: 'Database tables created successfully!' });
    } catch (error) {
        console.error('Migration failed:', error);
        res.status(500).json({
            error: 'Migration failed',
            details: error.message,
            stack: error.stack
        });
    }
});

// Add drop tables route (remove this after tables are recreated)
app.get('/drop-tables', async (req, res) => {
    try {
        console.log('Dropping existing tables...');
        
        await prisma.$executeRawUnsafe(`
            DROP TABLE IF EXISTS "UserProgress" CASCADE;
            DROP TABLE IF EXISTS "QuizAttempt" CASCADE;
            DROP TABLE IF EXISTS "QuizPurchase" CASCADE;
            DROP TABLE IF EXISTS "Question" CASCADE;
            DROP TABLE IF EXISTS "Quiz" CASCADE;
            DROP TABLE IF EXISTS "Resource" CASCADE;
            DROP TABLE IF EXISTS "Progress" CASCADE;
            DROP TABLE IF EXISTS "Account" CASCADE;
            DROP TABLE IF EXISTS "Module" CASCADE;
            DROP TABLE IF EXISTS "Path" CASCADE;
            DROP TABLE IF EXISTS "User" CASCADE;
        `);
        
        console.log('Tables dropped successfully');
        res.json({ message: 'Tables dropped successfully! Run /migrate to recreate them.' });
    } catch (error) {
        console.error('Drop tables failed:', error);
        res.status(500).json({
            error: 'Drop tables failed',
            details: error.message
        });
    }
});

// Add seed data route (remove this after seeding is done)
app.get('/seed', async (req, res) => {
    try {
        console.log('Seeding database...');

        // Create Frontend Foundations path
        const path = await prisma.path.create({
            data: {
                title: "Frontend Foundations",
                description: "Learn the fundamentals of frontend development",
                slug: "frontend-foundations",
                isPublished: true
            }
        });
        console.log('Created path:', path.title);

        // Create modules
        const modules = [
            { title: "HTML Semantics & Document Structure", orderIndex: 1 },
            { title: "CSS Fundamentals & Box Model", orderIndex: 2 },
            { title: "CSS Layout & Flexbox", orderIndex: 3 },
            { title: "CSS Grid & Advanced Layouts", orderIndex: 4 },
            { title: "JavaScript Basics & Variables", orderIndex: 5 },
            { title: "JavaScript Functions & Scope", orderIndex: 6 },
            { title: "JavaScript Arrays & Objects", orderIndex: 7 },
            { title: "JavaScript DOM Manipulation", orderIndex: 8 },
            { title: "JavaScript Events & Event Handling", orderIndex: 9 },
            { title: "JavaScript Async Programming", orderIndex: 10 },
            { title: "JavaScript ES6+ Features", orderIndex: 11 },
            { title: "JavaScript Error Handling", orderIndex: 12 },
            { title: "Responsive Design Principles", orderIndex: 13 },
            { title: "CSS Media Queries", orderIndex: 14 },
            { title: "CSS Preprocessors (Sass/SCSS)", orderIndex: 15 },
            { title: "CSS Frameworks (Bootstrap/Tailwind)", orderIndex: 16 },
            { title: "Web Accessibility (a11y)", orderIndex: 17 },
            { title: "Performance Optimization", orderIndex: 18 }
        ];

        for (const moduleData of modules) {
            await prisma.module.create({
                data: {
                    ...moduleData,
                    pathId: path.id,
                    description: `Learn ${moduleData.title.toLowerCase()}`
                }
            });
        }
        console.log('Created', modules.length, 'modules');

        res.json({ message: 'Database seeded successfully!', pathId: path.id, moduleCount: modules.length });
    } catch (error) {
        console.error('Seeding failed:', error);
        res.status(500).json({
            error: 'Seeding failed',
            details: error.message
        });
    }
});
app.use(
    session({
        secret: SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: { httpOnly: true },
    })
);
app.use(csrf());
app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});
app.use((req, res, next) => {
    res.locals.userEmail = req.session.userEmail;
    next();
});
app.use((req, res, next) => {
    res.locals.isAdmin = !!req.session.userIsAdmin;
    next();
});
function requireAuth(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    if (!req.session.userId) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    next();
}
function slugify(s: string) {
    return s.toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}
function requireAdmin(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
) {
    if (!req.session.userId) return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
    if (!req.session.userIsAdmin) return res.status(403).send("Admins only");
    next();
}
async function sendVerificationEmail(email: string, token: string, name: string) {
    const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : 'http://localhost:3000');
    const verificationUrl = `${baseUrl}/verify-email?token=${token}`;
    const msg = {
        to: email,
        from: process.env.SENDGRID_FROM_EMAIL || (process.env.NODE_ENV === 'production' ? 'noreply@yourdomain.com' : 'multj0574@gmail.com'),
        subject: 'Verify your RouteToDev account',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Welcome to RouteToDev! 🚀</h2>
                <p>Hi ${name},</p>
                <p>Thanks for signing up! Please verify your email address by clicking the button below:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${verificationUrl}" 
                       style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
                        Verify Email Address
                    </a>
                </div>
                <p>Or copy and paste this link into your browser:</p>
                <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
                <p>This link will expire in 24 hours.</p>
                <p>If you didn't create an account, you can safely ignore this email.</p>
                <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
                <p style="color: #666; font-size: 14px;">
                    RouteToDev - Your path to becoming a developer
                </p>
            </div>
        `,
        text: `
            Welcome to RouteToDev! 🚀
            Hi ${name},
            Thanks for signing up! Please verify your email address by visiting this link:
            ${verificationUrl}
            This link will expire in 24 hours.
            If you didn't create an account, you can safely ignore this email.
            RouteToDev - Your path to becoming a developer
        `
    };
    try {
        await sgMail.send(msg);
        logger.info('Verification email sent successfully', { email });
        return true;
    } catch (error) {
        logger.error('Failed to send verification email', { error, email });
        return false;
    }
}
app.post("/checkout/path", requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId!;
        const pathId = Number(req.body.pathId);
        logger.info('Path checkout attempt', { userId, pathId, pathSlug: req.body.pathSlug });
        if (!Number.isInteger(pathId)) {
            logger.warn('Invalid pathId in checkout', { pathId });
            return res.status(400).send("Bad pathId");
        }
        if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_PATH_USD) {
            logger.error('Stripe not configured for path checkout');
            return res.status(500).send("Stripe not configured");
        }
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                { price: STRIPE_PRICE_PATH_USD, quantity: 1 },
            ],
            metadata: {
                purchaseType: "PATH_BUNDLE",
                userId: String(userId),
                pathId: String(pathId),
            },
            success_url: `${req.protocol}://${req.get("host")}/quizzes?status=success`,
            cancel_url: `${req.protocol}://${req.get("host")}/p/${req.body.pathSlug || ""}?status=canceled`,
        });
        logger.info('Stripe session created for path checkout', { sessionId: session.id, url: session.url });
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Redirecting to Stripe...</title>
            </head>
            <body>
                <p>Redirecting to Stripe checkout...</p>
                <script>
                    window.location.href = "${session.url}";
                </script>
            </body>
            </html>
        `);
    } catch (e) {
        logger.error('Path checkout error', { error: e, userId: req.session.userId });
        res.status(500).send("Checkout error");
    }
});
app.post("/checkout/premium", requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId!;
        logger.info('Premium checkout attempt', { userId });
        if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_PREMIUM_USD) {
            logger.error('Stripe not configured for premium checkout');
            return res.status(500).send("Stripe not configured");
        }
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                { price: STRIPE_PRICE_PREMIUM_USD, quantity: 1 },
            ],
            metadata: {
                purchaseType: "PREMIUM_MEMBERSHIP",
                userId: String(userId),
            },
            success_url: `${req.protocol}://${req.get("host")}/quizzes?status=success`,
            cancel_url: `${req.protocol}://${req.get("host")}/quizzes?status=canceled`,
        });
        logger.info('Stripe session created for premium checkout', { sessionId: session.id, url: session.url });
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Redirecting to Stripe...</title>
            </head>
            <body>
                <p>Redirecting to Stripe checkout...</p>
                <script>
                    window.location.href = "${session.url}";
                </script>
            </body>
            </html>
        `);
    } catch (e) {
        logger.error('Premium checkout error', { error: e, userId: req.session.userId });
        res.status(500).send("Checkout error");
    }
});
app.get("/", async (req, res) => {
    const rawPaths = await prisma.path.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: "asc" },
        include: {
            modules: {
                orderBy: { orderIndex: "asc" },
                include: { resources: { orderBy: { id: "asc" } } },
            },
        },
    });
    let resourceDoneMap: Record<number, boolean> = {};
    if (req.session.userId) {
        const allResourceIds = rawPaths.flatMap((p) => p.modules.flatMap((m) => m.resources.map((r) => r.id)));
        if (allResourceIds.length > 0) {
            const progressRows = await prisma.progress.findMany({
                where: { userId: req.session.userId, resourceId: { in: allResourceIds } },
                select: { resourceId: true, status: true },
            });
            resourceDoneMap = Object.fromEntries(progressRows.map((r) => [r.resourceId, r.status === "DONE"]));
        }
    }
    const paths = rawPaths.map((p) => {
        const resources = p.modules.flatMap((m) => m.resources);
        const total = resources.length;
        const done = resources.filter((r) => resourceDoneMap[r.id]).length;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        let nextUrl: string | null = null;
        outer: for (const m of p.modules) {
            for (const r of m.resources) {
                if (!resourceDoneMap[r.id]) {
                    nextUrl = r.url;
                    break outer;
                }
            }
        }
        return {
            title: p.title,
            slug: p.slug,
            description: p.description,
            modulesCount: p.modules.length,
            progress: { percent, done, total },
            nextUrl,
        };
    });
    res.render("index", { paths });
});
app.get("/p/:slug", async (req, res) => {
    const { slug } = req.params;
    const p = await prisma.path.findUnique({
        where: { slug },
        include: {
            modules: {
                orderBy: { orderIndex: "asc" },
                include: { resources: { orderBy: { id: "asc" } } },
            },
        },
    });
    if (!p) return res.status(404).send("Path not found");
    let doneMap: Record<number, boolean> = {};
    if (req.session.userId) {
        const resourceIds = p.modules.flatMap((m) => m.resources.map((r) => r.id));
        if (resourceIds.length > 0) {
            const progressRows = await prisma.progress.findMany({
                where: { userId: req.session.userId, resourceId: { in: resourceIds } },
                select: { resourceId: true, status: true },
            });
            doneMap = Object.fromEntries(progressRows.map((r) => [r.resourceId, r.status === "DONE"]));
        }
    }
    const allResources = p.modules.flatMap((m) => m.resources);
    const totalResources = allResources.length;
    const doneResources = allResources.filter((r) => doneMap[r.id]).length;
    const overallPercent = totalResources > 0 ? Math.round((doneResources / totalResources) * 100) : 0;
    let nextResource: typeof allResources[number] | null = null;
    outer: for (const m of p.modules) {
        for (const r of m.resources) {
            if (!doneMap[r.id]) {
                nextResource = r;
                break outer;
            }
        }
    }
    const moduleProgressMap: Record<number, { done: number; total: number; percent: number }> = {};
    for (const m of p.modules) {
        const total = m.resources.length;
        const done = m.resources.filter((r) => doneMap[r.id]).length;
        const percent = total > 0 ? Math.round((done / total) * 100) : 0;
        moduleProgressMap[m.id] = { done, total, percent };
    }
    res.render("path", {
        p,
        doneMap,
        overall: {
            percent: overallPercent,
            done: doneResources,
            total: totalResources,
        },
        moduleProgressMap,
        nextResource,
    });
});
app.get("/register", (_req, res) => {
    res.render("register", { error: "" });
});
app.post("/register", authLimiter, async (req, res) => {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");
    const name = String(req.body.name || "").trim();
    if (!email || !password || !confirmPassword) {
        return res.status(400).render("register", { error: "All fields are required." });
    }
    if (password !== confirmPassword) {
        return res.status(400).render("register", { error: "Passwords do not match." });
    }
    if (password.length < 8) {
        return res.status(400).render("register", { error: "Password must be at least 8 characters long." });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).render("register", { error: "Email already in use." });
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
        data: {
            email,
            passwordHash,
            name,
            emailVerificationToken: verificationToken,
            emailVerificationExpires: verificationExpires
        }
    });
    const emailSent = await sendVerificationEmail(email, verificationToken, name);
    if (emailSent) {
        res.redirect("/login?message=check-email");
    } else {
        res.redirect("/login?error=email-failed");
    }
});
app.get("/verify-email", async (req, res) => {
    const token = req.query.token as string;
    if (!token) {
        return res.status(400).render("verify-email", {
            error: "Invalid verification link.",
            success: null
        });
    }
    try {
        const user = await prisma.user.findFirst({
            where: {
                emailVerificationToken: token,
                emailVerificationExpires: { gt: new Date() },
                emailVerified: false
            }
        });
        if (user) {
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    emailVerified: true,
                    emailVerificationToken: null,
                    emailVerificationExpires: null
                }
            });
            return res.render("verify-email", {
                error: null,
                success: "Email verified successfully! You can now log in to your account."
            });
        } else {
            return res.status(400).render("verify-email", {
                error: "Invalid or expired verification link. Please try registering again or contact support.",
                success: null
            });
        }
    } catch (error) {
        logger.error('Email verification error', { error, token });
        return res.status(500).render("verify-email", {
            error: "An error occurred during verification. Please try again.",
            success: null
        });
    }
});
app.get("/login", (req, res) => {
    const message = req.query.message as string;
    const error = req.query.error as string;
    let displayMessage = "";
    let displayError = "";
    if (message === "check-email") {
        displayMessage = "Registration successful! Please check your email to verify your account.";
    }
    if (error === "email-failed") {
        displayError = "Registration successful, but we couldn't send the verification email. Please contact support.";
    }
    res.render("login", {
        error: displayError,
        message: displayMessage,
        next: String(req.query.next || "/")
    });
});
app.post("/login", authLimiter, async (req, res) => {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    const nextUrl = String(req.body.next || "/");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
        return res.status(401).render("login", { error: "Invalid credentials.", next: nextUrl });
    }
    if (!user.emailVerified) {
        return res.status(401).render("login", {
            error: "Please verify your email address before logging in. Check your email for a verification link.",
            next: nextUrl
        });
    }
    req.session.userId = user.id;
    req.session.userEmail = user.email;
    res.redirect(nextUrl || "/");
});
app.post("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});
app.post("/progress", requireAuth, async (req, res) => {
    try {
        const userId = req.session.userId!;
        const resourceId = Number(req.body.resourceId);
        const action = String(req.body.action || "done");
        if (!Number.isInteger(resourceId)) return res.status(400).send("Bad resourceId");
        const status = action === "undo" ? "NOT_STARTED" : "DONE" as const;
        await prisma.progress.upsert({
            where: { userId_resourceId: { userId, resourceId } },
            update: { status, lastSeenAt: new Date() },
            create: { userId, resourceId, status, lastSeenAt: new Date() },
        });
        const isAjax = req.headers.accept?.includes('application/json') || req.headers['x-requested-with'] === 'XMLHttpRequest';
        if (isAjax) {
            res.json({ success: true, status });
        } else {
            const redirectTo = req.body.redirectTo;
            const referer = req.get("referer");
            if (redirectTo) {
                res.redirect(redirectTo);
            } else if (referer) {
                res.redirect(referer);
            } else {
                res.redirect("/");
            }
        }
    } catch (error) {
        logger.error('Progress update error', { error, userId: req.session.userId, resourceId: req.body.resourceId });
        const isAjax = req.headers['x-requested-with'] === 'XMLHttpRequest';
        if (isAjax) {
            res.status(500).json({ success: false, error: 'Internal server error' });
        } else {
            res.status(500).send('Internal server error');
        }
    }
});
app.get("/me", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const done = await prisma.progress.findMany({
        where: { userId, status: "DONE" },
        include: { resource: { select: { title: true, url: true, moduleId: true } } },
        orderBy: { lastSeenAt: "desc" },
        take: 50,
    });
    const rawPaths = await prisma.path.findMany({
        where: { isPublished: true },
        orderBy: { createdAt: "desc" },
        include: {
            modules: {
                orderBy: { orderIndex: "asc" },
                include: { resources: { orderBy: { id: "asc" } } },
            },
        },
    });
    const allResourceIds = rawPaths.flatMap((p) => p.modules.flatMap((m) => m.resources.map((r) => r.id)));
    let resourceDoneMap: Record<number, boolean> = {};
    if (allResourceIds.length > 0) {
        const progressRows = await prisma.progress.findMany({
            where: { userId, resourceId: { in: allResourceIds } },
            select: { resourceId: true, status: true },
        });
        resourceDoneMap = Object.fromEntries(progressRows.map((r) => [r.resourceId, r.status === "DONE"]));
    }
    const pathsAll = rawPaths.map((p) => {
        const resources = p.modules.flatMap((m) => m.resources);
        const total = resources.length;
        const doneCount = resources.filter((r) => resourceDoneMap[r.id]).length;
        const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
        const remainingMinutes = resources
            .filter((r) => !resourceDoneMap[r.id])
            .reduce((sum, r) => sum + (r.estMinutes ?? 0), 0);
        let nextUrl: string | null = null;
        outer: for (const m of p.modules) {
            for (const r of m.resources) {
                if (!resourceDoneMap[r.id]) { nextUrl = r.url; break outer; }
            }
        }
        return {
            title: p.title,
            slug: p.slug,
            progress: { percent, done: doneCount, total, remainingMinutes },
            nextUrl,
        };
    });
    const paths = pathsAll.filter((p) => p.progress.done > 0);
    function startOfISOWeek(date: Date): Date {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay();
        const diff = (day === 0 ? -6 : 1 - day);
        d.setDate(d.getDate() + diff);
        return d;
    }
    const now = new Date();
    const weekStart = startOfISOWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    let doneRowsWithTime: { resourceId: number; lastSeenAt: Date }[] = [];
    if (allResourceIds.length > 0) {
        doneRowsWithTime = await prisma.progress.findMany({
            where: { userId, status: "DONE", resourceId: { in: allResourceIds } },
            select: { resourceId: true, lastSeenAt: true },
        });
    }
    const resourceIdToLastSeen = new Map<number, Date>();
    for (const r of doneRowsWithTime) resourceIdToLastSeen.set(r.resourceId, r.lastSeenAt);
    type WeeklyCompletedModule = { pathTitle: string; pathSlug: string; moduleTitle: string; completedAt: Date };
    const weeklyCompletedModules: WeeklyCompletedModule[] = [];
    for (const p of rawPaths) {
        for (const m of p.modules) {
            if (m.resources.length === 0) continue;
            const allDone = m.resources.every((r) => resourceDoneMap[r.id]);
            if (!allDone) continue;
            let completedAt: Date | null = null;
            for (const r of m.resources) {
                const t = resourceIdToLastSeen.get(r.id);
                if (t && (!completedAt || t > completedAt)) completedAt = t;
            }
            if (!completedAt) continue;
            if (completedAt >= weekStart && completedAt < weekEnd) {
                weeklyCompletedModules.push({ pathTitle: p.title, pathSlug: p.slug, moduleTitle: m.title, completedAt });
            }
        }
    }
    weeklyCompletedModules.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
    const weeklyTarget = 1;
    const weeklyCompleted = weeklyCompletedModules.length;
    const weeklyPercent = Math.min(100, Math.round((weeklyCompleted / weeklyTarget) * 100));
    const weeklyGoal = {
        target: weeklyTarget,
        completed: weeklyCompleted,
        percent: weeklyPercent,
        modules: weeklyCompletedModules,
        weekStart,
        weekEnd,
    };
    res.render("me", { done, paths, weeklyGoal });
});
app.get("/quiz/:moduleId", requireAuth, async (req, res) => {
    const moduleId = Number(req.params.moduleId);
    if (!Number.isInteger(moduleId)) return res.status(400).send("Invalid module ID");
    const module = await prisma.module.findUnique({
        where: { id: moduleId },
        include: {
            path: true,
            quiz: {
                include: {
                    questions: {
                        orderBy: { orderIndex: "asc" }
                    }
                }
            }
        }
    });
    if (!module || !module.quiz) {
        return res.status(404).send("Quiz not found");
    }
    const userId = req.session.userId!;
    const hasPathAccess = await prisma.quizPurchase.findFirst({
        where: { userId, isActive: true, pathId: module.pathId, purchaseType: "PATH_BUNDLE" }
    });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const attempts = await prisma.quizAttempt.findMany({
        where: { userId, quizId: module.quiz.id },
        orderBy: { completedAt: "desc" },
        take: 5
    });
    res.render("quiz", {
        module,
        quiz: module.quiz,
        hasAccess: !!hasPathAccess || !!user?.isPremium,
        attempts,
        isPremium: !!user?.isPremium
    });
});
app.get("/quiz/:moduleId/take", requireAuth, async (req, res) => {
    const moduleId = Number(req.params.moduleId);
    if (!Number.isInteger(moduleId)) return res.status(400).send("Invalid module ID");
    const module = await prisma.module.findUnique({
        where: { id: moduleId },
        include: {
            path: true,
            quiz: {
                include: {
                    questions: {
                        orderBy: { orderIndex: "asc" }
                    }
                }
            }
        }
    });
    if (!module || !module.quiz) {
        return res.status(404).send("Quiz not found");
    }
    const userId = req.session.userId!;
    const hasPathAccess = await prisma.quizPurchase.findFirst({
        where: { userId, isActive: true, pathId: module.pathId, purchaseType: "PATH_BUNDLE" }
    });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!hasPathAccess && !user?.isPremium) {
        return res.redirect(`/quiz/${moduleId}?error=no-access`);
    }
    res.render("take-quiz", {
        module,
        quiz: module.quiz
    });
});
app.post("/quiz/:moduleId/submit", requireAuth, async (req, res) => {
    const moduleId = Number(req.params.moduleId);
    if (!Number.isInteger(moduleId)) return res.status(400).send("Invalid module ID");
    const module = await prisma.module.findUnique({
        where: { id: moduleId },
        include: {
            path: true,
            quiz: {
                include: {
                    questions: {
                        orderBy: { orderIndex: "asc" }
                    }
                }
            }
        }
    });
    if (!module || !module.quiz) {
        return res.status(404).send("Quiz not found");
    }
    const userId = req.session.userId!;
    const hasPathAccess = await prisma.quizPurchase.findFirst({
        where: { userId, isActive: true, pathId: module.pathId, purchaseType: "PATH_BUNDLE" }
    });
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!hasPathAccess && !user?.isPremium) {
        return res.status(403).send("No access");
    }
    let correctAnswers = 0;
    const totalQuestions = module.quiz.questions.length;
    const gradedAnswers: Record<string, any> = {};
    for (const question of module.quiz.questions) {
        const userAnswer = (req.body as any)[`answer_${question.id}`];
        const correctOptions = JSON.parse(question.correctAnswer);
        if (userAnswer && correctOptions.includes(userAnswer)) correctAnswers++;
        gradedAnswers[question.id] = {
            userAnswer,
            correct: correctOptions.includes(userAnswer),
            correctAnswers: correctOptions
        };
    }
    const score = Math.round((correctAnswers / totalQuestions) * 100);
    await prisma.quizAttempt.create({
        data: {
            userId,
            quizId: module.quiz.id,
            score,
            totalQuestions,
            correctAnswers,
            answers: JSON.stringify(gradedAnswers),
            completedAt: new Date()
        }
    });
    res.render("quiz-results", {
        module,
        quiz: module.quiz,
        score,
        totalQuestions,
        correctAnswers,
        gradedAnswers
    });
});
app.get("/pricing", async (req, res) => {
    res.render("pricing", {
        userEmail: req.session.userEmail,
        csrfToken: req.csrfToken(),
    });
});
app.get("/quizzes", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const purchases = await prisma.quizPurchase.findMany({ where: { userId, isActive: true, purchaseType: "PATH_BUNDLE" } });
    const premium = !!user?.isPremium;
    const pathIds = purchases.map(p => p.pathId!).filter(Boolean);
    const quizzes = await prisma.quiz.findMany({
        where: premium ? {} : {
            module: { pathId: { in: pathIds } }
        },
        include: { module: { include: { path: true } } },
        orderBy: [{ module: { pathId: "asc" } }, { moduleId: "asc" }]
    });
    const attempts = await prisma.quizAttempt.findMany({
        where: { userId, quizId: { in: quizzes.map(q => q.id) } },
        orderBy: { completedAt: "desc" },
    });
    const lastAttemptByQuizId = new Map<number, typeof attempts[number]>();
    for (const a of attempts) if (!lastAttemptByQuizId.has(a.quizId)) lastAttemptByQuizId.set(a.quizId, a);
    res.render("quizzes", {
        quizzes: quizzes.map(q => ({
            id: q.id,
            title: q.title,
            moduleId: q.moduleId,
            moduleTitle: q.module.title,
            pathTitle: q.module.path.title,
            questionCount: q.questionCount,
            lastAttempt: lastAttemptByQuizId.get(q.id) || null,
        })),
        premium,
    });
});
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err && err.code === "EBADCSRFTOKEN") {
        logger.warn('CSRF token validation failed', { ip: _req.ip, userAgent: _req.get('user-agent') });
        return res.status(403).send("Invalid CSRF token");
    }
    next(err);
});
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('user-agent'),
        userId: req.session?.userId
    });
    if (res.headersSent) {
        return next(err);
    }
    const isDev = process.env.NODE_ENV !== 'production';
    res.status(500).render('error', {
        error: isDev ? err : { message: 'Internal Server Error' },
        isDev
    });
});
app.use((req: express.Request, res: express.Response) => {
    logger.warn('404 Not Found', { url: req.url, method: req.method, ip: req.ip });
    res.status(404).render('error', {
        error: { message: 'Page not found' },
        isDev: process.env.NODE_ENV !== 'production'
    });
});
app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`, {
        env: process.env.NODE_ENV || 'development',
        port: PORT
    });
});
