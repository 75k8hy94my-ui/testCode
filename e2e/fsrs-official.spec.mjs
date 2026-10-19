import { test, expect } from '@playwright/test';

test('official ts-fsrs grades cards and persists official state', async ({page}) => {
  await page.goto('index.html');
  await page.getByRole('button',{name:'ログインせずに使う'}).click();
  await page.evaluate(() => localStorage.setItem('testCode.statutes.definitions.v1',JSON.stringify([{
    subject:'civil-general',article:'１条',part:0,start:0,end:2,
    quote:'私権',definition:'私法上の権利',card:true
  }])));
  await page.goto('definition-cards.html');
  await expect(page.locator('#definitionCardsFlip')).toBeEnabled();
  await expect(page.locator('#definitionCardsTerm')).toHaveText('私権');
  await page.locator('#definitionCardsFlip').click();
  await page.locator('[data-grade="2"]').click();
  const result=await page.evaluate(()=>{
    const records=JSON.parse(localStorage.getItem('testCode.statutes.definitionReviews.v1')||'{}');
    return Object.values(records)[0];
  });
  expect(result.algorithm).toBe('ts-fsrs-v6');
  expect(result.fsrsCard.state).toBeGreaterThan(0);
  expect(result.reviews).toHaveLength(1);
  expect(result.due).toBeGreaterThan(result.lastReviewed);
  await page.getByRole('button',{name:'公式FSRSで最適化'}).click();
  await expect(page).toHaveURL(/fsrs-trainer\/index\.html$/);
  await expect(page.locator('#fsrsTrainerRun')).toBeVisible();
});

test('FSRS trainer isolates only its own route on localhost', async ({page}) => {
  await page.goto('fsrs-trainer/index.html');
  await expect.poll(async()=>page.evaluate(()=>globalThis.crossOriginIsolated),{timeout:15000}).toBe(true);
  await expect(page.locator('#fsrsTrainerRun')).toBeEnabled();
  await page.locator('#fsrsTrainerRun').click();
  await expect(page.locator('#fsrsTrainerStatus')).toContainText('学習履歴が不足');
});

test('official Rust optimizer trains locally and saves 21 coefficients', async ({page}) => {
  test.setTimeout(120_000);
  await page.goto('index.html');
  await page.evaluate(() => {
    const records={},day=86400000,now=Date.UTC(2026,9,19);
    // Vary first ratings, intervals and successes. Constant recall rates
    // cannot initialize a personalized FSRS curve (NotEnoughData).
    for(let i=0;i<640;i++){
      const base=now-(280+i%50)*day;
      let t=base;
      const reviews=[];
      const count=3+(i%5);
      for(let j=0;j<count;j++){
        const interval=j===0?0:1+((i*17+j*29+(i>>2))%75);
        t+=interval*day;
        const seed=(i*73+j*109+i*j*13)%101;
        const grade=j===0?i%4:(seed<23?0:seed<36?1:seed<85?2:3);
        reviews.push({at:t,grade,due:t+day});
      }
      records['synthetic:'+i]={reviews};
    }
    localStorage.setItem('testCode.statutes.definitionReviews.v1',JSON.stringify(records));
  });
  await page.goto('fsrs-trainer/index.html');
  await expect.poll(async()=>page.evaluate(()=>globalThis.crossOriginIsolated),{timeout:20000}).toBe(true);
  await expect(page.locator('#fsrsTrainerRun')).toBeEnabled();
  await page.locator('#fsrsTrainerRun').click();
  await expect(page.locator('#fsrsTrainerStatus')).toContainText(/最適化が完了しました|最適化に失敗しました/,{timeout:90000});
  await expect(page.locator('#fsrsTrainerStatus')).toContainText('最適化が完了しました');
  const weights=await page.evaluate(()=>JSON.parse(localStorage.getItem('testCode.statutes.definitionFSRSWeights.v1')));
  expect(weights).toHaveLength(21);
  expect(weights.every(x=>Number.isFinite(x))).toBe(true);
});
