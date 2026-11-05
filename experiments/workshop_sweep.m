function results = workshop_sweep()
% 运行 workshop_sweep，输出135次计算结果与三张车速敏感性图。
% 无额外工具箱依赖。参数网格固定，倍率越小代表生产越快。
folder = fullfile(fileparts(mfilename('fullpath')), 'sweep_results');
if ~exist(folder, 'dir')
    mkdir(folder);
end
scenes = {'steady','surge','tight'};
sceneNames = {'平稳生产','局部加速','同步申请'};
policies = {'fifo','risk','aging'};
speeds = [0.4 0.5 0.8 1 2];
multipliers = [0.75 1 1.25];
rows = cell(135,10);
row = 0;
curves = zeros(3,5,3);
for sceneIndex = 1:3
    for speedIndex = 1:5
        speed = speeds(speedIndex);
        for multiplier = multipliers
            period = [30 24 36 30]*multiplier;
            if sceneIndex == 2
                period(2) = 16*multiplier;
            end
            load = sum((35+2*[25 40 55 70]/speed)./(12*period));
            for policyIndex = 1:3
                values = simulate(scenes{sceneIndex}, policies{policyIndex}, speed, multiplier);
                row = row+1;
                rows(row,:) = [scenes(sceneIndex), {speed,multiplier}, ...
                    policies(policyIndex), num2cell(values), {load}];
                if multiplier == 1
                    curves(sceneIndex,speedIndex,policyIndex) = values(1);
                end
            end
        end
    end
end
results = cell2table(rows,'VariableNames',{'scene','speed_mps','cycle_multiplier', ...
    'policy','stop_min','late','products','distance_m','max_station_stop_min','required_vehicle_load'});
writetable(results,fullfile(folder,'sweep_comparison.csv'));
for sceneIndex = 1:3
    fig = figure('Color','white','Position',[100 100 900 560]);
    values = squeeze(curves(sceneIndex,:,:));
    plot(speeds,values,'-o','LineWidth',1.6,'MarkerSize',6);
    grid on
    xlabel('配送车速度（m/s）');
    ylabel('累计缺料停工（工位·分钟）');
    title([sceneNames{sceneIndex}, '，生产节拍倍率1.00']);
    legend({'先申请先送','风险优先','风险与等待'}, ...
        'Location','northoutside','Orientation','horizontal');
    print(fig,fullfile(folder,[scenes{sceneIndex},'_speed.png']),'-dpng','-r200');
end
fprintf('完成135次实验，文件保存在 %s\n',folder);
disp(results(1:9,:));
end

function metrics = simulate(scene,policy,speed,multiplier)

% 本次固定参数网格的所有事件均落在0.25秒网格上。
dt = 0.25; stock = [12 9 15 10];
if strcmp(scene,'tight'), stock(:) = 6; end
distance = [25 40 55 70]; period = [30 24 36 30]*multiplier;
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
    if strcmp(scene,'surge') && t == 900, period(2) = 16*multiplier; end
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
