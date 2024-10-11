/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { JSDOM } from 'jsdom';
import { Page, Section } from '../utils';

function parse(url: string, document: Document): Page {
    // Result for the current page
    const page: Page = {
        url,
        sections: [],
    };

    // Extract the sections from the current page
    const sections: Section[] = [];
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    let currentHeading: string | null = null;
    let currentContent: string = '';
    for (const heading of headings) {
        if (currentHeading) {
            sections.push({
                heading: currentHeading,
                content: currentContent.trim(),
            });
            currentContent = '';
        }
        currentHeading = heading.textContent;
        let nextElement = heading.nextElementSibling;
        while (nextElement && !nextElement.tagName.startsWith('H')) {
            currentContent += nextElement.textContent;
            nextElement = nextElement.nextElementSibling;
        }
    }
    if (currentHeading) {
        sections.push({
            heading: currentHeading,
            content: currentContent.trim(),
        });
    }
    page.sections = sections;
    return page;
}

async function recursiveCrawl(url: string, seen: Set<string>): Promise<Page[]> {
    const pages: Page[] = [];

    if (seen.has(url)) {
        return pages;
    }

    seen.add(url);

    try {
        const response = await fetch(url);
        const html = await response.text();
        const dom = new JSDOM(html);
        const { document } = dom.window;

        // Result for the current page
        const page = parse(url, document);
        pages.push(page);

        // Recurse into child pages
        const rootUrl = new URL(url);
        const links = document.querySelectorAll('a[href]');
        for (const link of links) {
            const href = link.getAttribute('href');
            if (href && href.startsWith('/') && !href.startsWith('//')) {
                const foundUrl = new URL(href, url);
                // strip the hash & query to ensure we don't crawl the same page multiple times
                foundUrl.hash = '';
                foundUrl.search = '';
                if (foundUrl.hostname === rootUrl.hostname && foundUrl.pathname.startsWith(rootUrl.pathname)) {
                    const childPages = await recursiveCrawl(foundUrl.href, seen);
                    pages.push(...childPages);
                }
            }
        }
    } catch (error) {
        console.error(`Failed to crawl ${url}: ${error}`);
    }

    return pages;
}

export function crawl(url: string) {
    const seenUrls = new Set<string>();
    return recursiveCrawl(url, seenUrls);
}

export async function scrape(url: string) {
    const response = await fetch(url);
    const html = await response.text();
    const dom = new JSDOM(html);
    const { document } = dom.window;

    const page = parse(url, document);
    return page;
}
