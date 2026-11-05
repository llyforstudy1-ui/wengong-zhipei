function results = workshop_experiment()
% 在 MATLAB 中运行 workshop_experiment。结果保存在程序旁的 results 文件夹。
folder = fullfile(fileparts(mfilename('fullpath')), 'results');
if ~exist(folder,'dir'), mkdir(folder); end
scenes = {'steady','surge','tight'};
policies = {'fifo','risk','aging'};
rows = cell(9,7);
stops = zeros(3,3);
for i = 1:3
    for j = 1:3
        values = simulate(scenes{i},policies{j});
        rows((i-1)*3+j,:) = [scenes(i),policies(j),num2cell(values)];
        stops(i,j) = values(1);
    end
end
results = cell2table(rows,'VariableNames',{'scene','policy','stop_min','late','products','distance_m','max_station_stop_min'});
disp(results)
writetable(results,fullfile(folder,'comparison.csv'));
figure('Color','white'); bar(stops); grid on
set(gca,'XTick',1:3,'XTickLabel',{'平稳生产','局部加速','配送紧张'});
ylabel('累计停工（工位·分钟）'); legend({'先申请先送','风险优先','风险与等待'},'Location','best');
title('相同工况下的60分钟配送实验');
print(gcf,fullfile(folder,'downtime.png'),'-dpng','-r200');
end

function metrics = simulate(scene,policy)
% 三个预设工况的事件时刻均落在0.25秒网格上。
dt = 0.25; speed = 0.8; stock = [12 9 15 10];
if strcmp(scene,'tight'), speed = 0.5; stock(:) = 6; end
distance = [25 40 55 70]; period = [30 24 36 30];
finish = inf(1,4); request = inf(1,4); counted = false(1,4);
stop = zeros(1,4); products = 0; late = 0; travelled = 0;
arrival = inf; returned = inf; depart = inf; unloaded = inf; target = 0;
for tick = 0:round(3600/dt)
    t = tick*dt;
    done = finish == t; products = products + sum(done); finish(done) = inf;
    if t == unloaded
        stock(target) = stock(target)+12;
        request(target) = inf; counted(target) = false;
    end
    if t == returned, target = 0; end
    if t == 3600, break; end
    if strcmp(scene,'surge') && t == 900, period(2) = 16; end
    start = isinf(finish) & stock>0;
    stock(start) = stock(start)-1;
    finish(start) = t+period(start);
    request(stock<=6 & isinf(request)) = t;
    waiting = find(isfinite(request));
    if target == 0 && ~isempty(waiting)
        remaining = finish-t; remaining(isinf(remaining)) = 0;
        slack = remaining + stock.*period - (35+distance/speed);
        switch policy
            case 'fifo', score = request;
            case 'risk', score = slack;
            case 'aging', score = slack-(t-request);
        end
        candidates = [score(waiting)',request(waiting)',waiting(:)];
        candidates = sortrows(candidates,[1 2 3]); target = candidates(1,3);
        depart = t+20; arrival = depart+distance(target)/speed;
        unloaded = arrival+15; returned = unloaded+distance(target)/speed;
    end
    idle = isinf(finish); stop(idle) = stop(idle)+dt;
    firstLate = idle & ~counted & isfinite(request);
    late = late+sum(firstLate); counted(firstLate) = true;
    if target>0 && ((t>=depart && t<arrival) || (t>=unloaded && t<returned))
        travelled = travelled+speed*dt;
    end
end
metrics = [sum(stop)/60,late,products,travelled,max(stop)/60];
end
