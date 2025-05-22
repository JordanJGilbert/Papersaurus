# Next.js Chatbot

This is a Next.js, Tailwind CSS, and Shadcn/ui powered chatbot application.

## Setup

1.  Navigate to the `nextjs-chatbot` directory:
    ```bash
    cd nextjs-chatbot
    ```

2.  Install dependencies:
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  Initialize Shadcn/ui (this step might show you changes to `tailwind.config.ts` and `globals.css` - review them. The provided files should be mostly compatible, but it's good to confirm what `shadcn-ui` suggests):
    ```bash
    npx shadcn-ui@latest init
    ```
    When prompted:
    -   Would you like to use TypeScript (recommended)? **Yes**
    -   Which style would you like to use? **Default** (or choose your preference)
    -   Which color would you like to use as base color? **Slate** (or choose your preference)
    -   Where is your `global.css` file? **`app/globals.css`**
    -   Do you want to use CSS variables for colors? **Yes**
    -   Where is your `tailwind.config.js` (or `.ts`) file? **`tailwind.config.ts`**
    -   Configure import alias for components: **`@/components`**
    -   Configure import alias for utils: **`@/lib`**
    -   Are you using React Server Components? **Yes**

4.  Run the development server:
    ```bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. 