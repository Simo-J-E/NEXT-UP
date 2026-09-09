import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { rawPage } from '../tests/fixtures';
import { normalizeInventory } from '../worker/providers/inventory';

test.beforeEach(async ({ page }) => {
  // Deterministic CI: no external artwork, credentials or provider traffic.
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route('**/api/health', (route) =>
    route.fulfill({
      json: {
        steam: false,
        inventory: false,
        store: false,
        configured: false,
        privacy: { contact: '', controller: '', countries: '' },
      },
    }),
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Pick your next game.' }),
  ).toBeVisible();
});

test('custom game survives reload, selection is retained and the one-game cycle ends', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Add a game', exact: true }).click();
  await page.getByLabel('Game name', { exact: true }).fill('Minecraft');
  await page.getByLabel('Platform or launcher').fill('Minecraft Launcher');
  await page.getByRole('button', { name: 'Add to my games' }).click();
  await expect(
    page.getByText('Minecraft added.', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', { name: 'Spin the wheel', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Selected game' }),
  ).toContainText('Minecraft');
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Selected game' }),
  ).toContainText('Minecraft');
  await expect(
    page.getByRole('button', { name: 'Roll again', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Reset filters and cycle' }).click();
  await expect(
    page.getByRole('button', { name: 'Roll again', exact: true }),
  ).toBeEnabled();
});

test('animation prevents repeated clicks and persists the result before completion', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page
    .getByRole('button', { name: 'Spin the wheel', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Choosing…', exact: true }),
  ).toBeDisabled();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const req = indexedDB.open('next-up-v1');
            req.onerror = reject;
            req.onsuccess = () => {
              const tx = req.result.transaction('state');
              const q = tx.objectStore('state').get('current');
              q.onsuccess = () => {
                resolve(q.result.rolls.length);
                req.result.close();
              };
            };
          }),
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(
    page.getByRole('region', { name: 'Selected game' }).getByRole('heading'),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Roll again', exact: true }),
  ).toBeEnabled();
});

test('favorites and exclusions are retained and demo does not erase a real library', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page
    .getByRole('button', { name: 'Favorite Hades', exact: true })
    .click();
  await page.getByRole('checkbox', { name: /In wheel\s*:\s*Hades/ }).uncheck();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Favorite Hades', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.getByRole('checkbox', { name: /In wheel\s*:\s*Hades/ }),
  ).not.toBeChecked();
  await page
    .getByRole('button', { name: 'Use my library', exact: true })
    .click();
  await expect(page.getByText('Your collection starts here')).toBeVisible();
});

test('private game details never display a public empty library', async ({
  page,
}) => {
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      json: {
        profile: {
          steamId: '76561198000000000',
          name: 'Private fixture',
          avatar: '',
          visibility: 'public',
        },
        status: 'private',
        games: [],
        fetchedAt: '2026-09-09T10:00:00.000Z',
        message: 'Game details are private. Set Game details to Public.',
      },
    }),
  );
  await page
    .getByLabel('Steam profile link or SteamID64')
    .fill('76561198000000000');
  await page.getByRole('button', { name: 'Load games', exact: true }).click();
  await expect(
    page.getByText('Game details are private. Set Game details to Public.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Add a game', exact: true }),
  ).toBeEnabled();
});

test('loads every inventory page and keeps unpriced items', async ({
  page,
}) => {
  await page.route('**/api/profile', (route) =>
    route.fulfill({
      json: {
        profile: {
          steamId: '76561198000000000',
          name: 'Inventory fixture',
          avatar: '',
          visibility: 'public',
        },
        status: 'public',
        games: [],
        fetchedAt: '2026-09-09T10:00:00.000Z',
      },
    }),
  );
  const cursors: (string | undefined)[] = [];
  await page.route('**/api/inventory', async (route) => {
    const body = route.request().postDataJSON() as { cursor?: string };
    cursors.push(body.cursor);
    const result = normalizeInventory(
      rawPage(body.cursor ? '2' : '1', body.cursor ? undefined : '2'),
      730,
    );
    await route.fulfill({
      json: {
        steamId: '76561198000000000',
        appId: 730,
        ...result,
        status: result.cursor ? 'partial' : 'complete',
        fetchedAt: '2026-09-09T10:00:00.000Z',
      },
    });
  });
  await page.route('**/api/market/prices', (route) =>
    route.fulfill({ json: { prices: [] } }),
  );
  await page
    .getByLabel('Steam profile link or SteamID64')
    .fill('76561198000000000');
  await page.getByRole('button', { name: 'Load games', exact: true }).click();
  await expect(
    page.getByText('0 games loaded. Ready when you are.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Load CS2', exact: true }).click();
  await expect(page.getByText('2 distinct assets · complete')).toBeVisible();
  expect(cursors).toEqual([undefined, '2']);
  await expect(page.getByRole('table').first().getByRole('row')).toHaveCount(3);
});

test('keyboard dialogs, mobile reflow, and WCAG 2.2 automated rules', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Try demo', exact: true }).click();
  for (const tab of ['Play', 'Library', 'Inventory']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(scan.violations).toEqual([]);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
  const settings = page.getByRole('button', {
    name: 'Data and preferences',
    exact: true,
  });
  await settings.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(settings).toBeFocused();
});
