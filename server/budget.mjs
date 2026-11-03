import {localDate} from '../core/time.mjs';
export function budgetStatus(state,limits,now){
  const day=localDate(now,state.profile.timeZone),month=day.slice(0,7);
  const total=range=>state.usage.filter(u=>u.day.startsWith(range)).reduce((n,u)=>n+u.charged,0)+(range===limits.baselineDay||range===limits.baselineMonth?Number(limits.baselineUsd||0):0);
  const usedUsd=total(month),dayUsedUsd=total(day),thresholdUsd=Number(limits.month),dailyThresholdUsd=Number(limits.day);
  const exceeded=usedUsd>=thresholdUsd||dayUsedUsd>=dailyThresholdUsd;
  return {period:month,usedUsd,dayUsedUsd,thresholdUsd,dailyThresholdUsd,exceeded,blocking:limits.mode==='hard',estimated:true,
    message:exceeded?'Порог расходов ИИ превышен. Помощник продолжает работать. Сумма в настройках.':null};
}
