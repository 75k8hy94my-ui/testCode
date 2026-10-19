import {test,expect} from '@playwright/test';

test('create, revise and review a manually entered card without a statute definition',async({page})=>{
 await page.goto('index.html');
 await page.getByRole('button',{name:'ログインせずに使う'}).click();
 await page.goto('definition-cards.html');
 await expect(page.locator('#definitionCardsEmpty')).toContainText('カードはまだありません');
 await page.locator('#definitionCardsManageToggle').click();
 await page.locator('#definitionCardsManualFront').fill('民法９４条２項の類推適用要件');
 await page.locator('#definitionCardsManualBack').fill('虚偽の外観、帰責性、第三者の正当な信頼');
 await page.locator('#definitionCardsManualCategory').fill('民法・総則');
 await page.locator('#definitionCardsManualSave').click();
 await expect(page.locator('#definitionCardsTerm')).toHaveText('民法９４条２項の類推適用要件');
 await expect(page.locator('#definitionCardsSource')).toContainText('民法・総則');
 await page.locator('#definitionCardsFlip').click();
 await expect(page.locator('#definitionCardsAnswer')).toContainText('虚偽の外観');
 await page.locator('[data-grade="2"]').click();
 const snapshot=await page.evaluate(()=>{
   const cards=JSON.parse(localStorage.getItem('testCode.statutes.manualCards.v1'));
   const review=JSON.parse(localStorage.getItem('testCode.statutes.definitionReviews.v1'));
   return {cards,review};
 });
 expect(snapshot.cards).toHaveLength(1);
 expect(Object.keys(snapshot.review)).toEqual(['manual:'+snapshot.cards[0].id]);
 const prior=snapshot.review['manual:'+snapshot.cards[0].id];
 expect(prior.algorithm).toBe('ts-fsrs-v6');
 await page.reload();
 await page.locator('#definitionCardsManageToggle').click();
 await expect(page.locator('#definitionCardsManualTotal')).toHaveText('(1枚)');
 await page.locator('#definitionCardsManualList button').first().click();
 await page.locator('#definitionCardsManualBack').fill('善意と無過失（類型に応じて検討）');
 await page.locator('#definitionCardsManualSave').click();
 const saved=await page.evaluate(()=>{
   const cards=JSON.parse(localStorage.getItem('testCode.statutes.manualCards.v1'));
   const review=JSON.parse(localStorage.getItem('testCode.statutes.definitionReviews.v1'));
   return {cards,review};
 });
 expect(saved.cards[0].id).toBe(snapshot.cards[0].id);
 expect(saved.cards[0].back).toContain('善意');
 expect(saved.review['manual:'+snapshot.cards[0].id].reviews).toHaveLength(prior.reviews.length);
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#definitionCardsManualList button').last().click();
 await expect(page.locator('#definitionCardsManualTotal')).toHaveText('(0枚)');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('testCode.statutes.definitionReviews.v1')||'{}'))).toEqual({});
});
