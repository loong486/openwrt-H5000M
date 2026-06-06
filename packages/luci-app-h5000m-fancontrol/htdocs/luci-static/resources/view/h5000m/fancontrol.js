'use strict';
'require view';
'require form';
'require fs';
'require ui';

return view.extend({
	load: function() {
		return fs.exec('/usr/sbin/h5000m-fancontrol', [ 'status' ]).catch(function() {
			return { stdout: '' };
		});
	},

	parseStatus: function(res) {
		var data = {};

		(res.stdout || '').trim().split(/\n/).forEach(function(line) {
			var pos = line.indexOf('=');

			if (pos > -1)
				data[line.substring(0, pos)] = line.substring(pos + 1);
		});

		return data;
	},

	formatTemp: function(value) {
		return value ? _('%s °C').format(value) : _('未知');
	},

	formatRpm: function(data) {
		if (data.fan_rpm)
			return _('%s RPM').format(data.fan_rpm);

		if (data.fan_feedback === '0')
			return _('无转速反馈');

		return _('未知');
	},

	statusCard: function(title, value, hint) {
		return E('div', { 'class': 'h5000m-fan-card' }, [
			E('div', { 'class': 'h5000m-fan-card-title' }, title),
			E('div', { 'class': 'h5000m-fan-card-value' }, value),
			hint ? E('div', { 'class': 'h5000m-fan-card-hint' }, hint) : null
		]);
	},

	statusPanel: function(data) {
		var pwmHint = data.pwm ? data.pwm.replace('/sys/class/hwmon/', '') : _('未找到 PWM 节点');
		var fanHint = data.fan_feedback === '0' ? _('当前 pwmfan 驱动未暴露 fan_input') : (data.fan || '');

		return E('div', { 'class': 'h5000m-fan-status' }, [
			E('style', {}, [
				'.h5000m-fan-status{margin-bottom:16px}',
				'.h5000m-fan-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}',
				'.h5000m-fan-card{border:1px solid var(--border-color-medium,#d8d8d8);border-radius:8px;padding:12px;background:var(--background-color-high,#fff);min-height:76px}',
				'.h5000m-fan-card-title{font-size:12px;color:var(--text-color-medium,#666);margin-bottom:6px}',
				'.h5000m-fan-card-value{font-size:22px;line-height:1.2;font-weight:600;color:var(--text-color-high,#222);word-break:break-word}',
				'.h5000m-fan-card-hint{font-size:11px;color:var(--text-color-low,#888);margin-top:6px;word-break:break-word}',
				'.h5000m-fan-note{margin-top:10px;color:var(--text-color-medium,#666)}'
			].join('')),
			E('h3', _('当前状态')),
			E('div', { 'class': 'h5000m-fan-grid' }, [
				this.statusCard(_('风扇转速'), this.formatRpm(data), fanHint),
				this.statusCard(_('当前 PWM'), data.pwm_value || _('未知'), pwmHint),
				this.statusCard(_('模块温度'), this.formatTemp(data.module_temp), _('来自 QModem 缓存')),
				this.statusCard(_('CPU 温度'), this.formatTemp(data.cpu_temp), data.temp1_label || ''),
				this.statusCard(_('WiFi 温度 1'), this.formatTemp(data.wifi1_temp), data.temp3_label || ''),
				this.statusCard(_('WiFi 温度 2'), this.formatTemp(data.wifi2_temp), data.temp4_label || '')
			]),
			data.fan_feedback === '0'
				? E('div', { 'class': 'h5000m-fan-note' }, _('当前系统只提供 PWM 控制，没有提供风扇转速反馈节点。'))
				: null
		]);
	},

	render: function(res) {
		var m, s, o;
		var status = this.parseStatus(res);

		m = new form.Map('h5000m_fancontrol', _('风扇控制'));
		m.description = _('调节 PWM 风扇策略。');

		s = m.section(form.NamedSection, 'settings', 'settings');
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('启用'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.ListValue, 'mode', _('模式'));
		o.value('auto', _('自动'));
		o.value('manual', _('手动'));
		o.value('off', _('关闭'));
		o.default = 'auto';
		o.rmempty = false;

		o = s.option(form.Value, 'manual_pwm', _('手动 PWM'));
		o.datatype = 'range(0,255)';
		o.default = '160';

		o = s.option(form.Value, 'min_pwm', _('最低 PWM'));
		o.datatype = 'range(0,255)';
		o.default = '80';

		o = s.option(form.Value, 'max_pwm', _('最高 PWM'));
		o.datatype = 'range(0,255)';
		o.default = '255';

		o = s.option(form.Value, 'low_temp', _('低温阈值'));
		o.datatype = 'range(0,120)';
		o.default = '45';

		o = s.option(form.Value, 'high_temp', _('高温阈值'));
		o.datatype = 'range(1,120)';
		o.default = '70';

		o = s.option(form.Value, 'interval', _('刷新间隔'));
		o.datatype = 'range(5,300)';
		o.default = '15';

		m.handleSaveApply = function(ev, mode) {
			return form.Map.prototype.handleSaveApply.apply(this, [ ev, mode ]).then(function() {
				return fs.exec('/usr/sbin/h5000m-fancontrol', [ 'apply' ]).then(function() {
					return fs.exec('/etc/init.d/h5000m-fancontrol', [ 'restart' ]);
				}).then(function() {
					ui.addNotification(null, E('p', _('风扇控制已应用。')));
				}, function(err) {
					ui.addNotification(null, E('p', _('风扇控制应用失败：') + err.message), 'danger');
				});
			});
		};

		return m.render().then(L.bind(function(node) {
			return E('div', {}, [ this.statusPanel(status), node ]);
		}, this));
	}
});
